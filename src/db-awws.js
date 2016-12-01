"use strict";

var modPath         = require("path"),
	modFs           = require("fs"),
	Ajax            = require("eg-node-ajax"),
	DBRequest       = require("./db-awws-request.js"),
	awwsBase64      = require("./db-awws-base64.js"),
	awwsUtils       = require("./db-awws-utils.js"),
	Va              = require ("./db-awws-arg-validator.js"),
	modUtil         = require("util"),
	EventEmitter    = require("events");


/**
 * @constructor
 * @module eg-db-awws
 * */
var DBAwwS = function(arg) {
	if (typeof arg != "object")
		throw new Error(`arg supposed to be "object". "${typeof arg}" given`);

	EventEmitter.call(this);

	// ------------------------
	// Не изменять ключи,
	// через них могут взаимодействовать другие программы
	// ------------------------
	this.dbconfigs      = [];
	this.dburl          = null;
	this.dbname         = null;
	this.dbsrc          = null;
	this.dblogdir       = null;

	// ------------------------

	this.log                    = [];
	this.errors                 = [];
	this.reqFailRepeats         = 1;
	this.awwsCacheEnable        = true;
	this.logUseBacktrace        = false;
	this.reqAfterFailTimeout    = 500;
	this._reqStorage            = Object.create(null);

	// "rapidCache" - возвращает быстрый кэш для одинаковых запросов
	// в течении настроенного времени

	this.rapidCache = {
		"timeout": 2000,
		"onHttpResponseEmpty": false,
		"onRace": false,
		"onHasCache": false
	};

	this.instances.push(this);

	// ------------------------
	// Присвоение ключей из аргумента как свойства объекта
	// ------------------------
	arg && Object.keys(arg).forEach((a) => {
		this[a] = arg[a];
	});
};


// Наследование событийной модели
modUtil.inherits(DBAwwS, EventEmitter);


DBAwwS.prototype.instances = [];


/**
 * Получить экземпляр
 * @param {Object} arg - аргументы в конструктор
 * */
DBAwwS.prototype.getInstance = function(arg) {
	return this.instances.length ? this.instances[0] : new DBAwwS(arg);
};


/**
 * Разбить строку пакетного запроса на массив одиночных
 * @param {String} s - текст запроса
 * @return {Array}
 * */
DBAwwS.prototype.splitSQL = function(s) {
	s = awwsUtils
			.trim(s, ' ;\\t\\n\\r\\0\\x0B')
			.split('');

	var c,
		L = s.length,
		last = L - 1,
		q = "",
		ret = [],
		subRet = "";

	for (c = 0; c < L; c++) {
		if (
			(
				s[c] == '"'
				|| s[c] == "'"
			)
			&& (
				s[c - 1] != "\\"
				|| (
					s[c - 1] == "\\"
					&& s[c - 2] == "\\"
				)
			)
		) {
			if (q == s[c]) {
				q = '';
			} else {
				q = s[c];
			}
		}

		if ((s[c] == ';') && !q)
			ret.push(subRet) && (subRet = "");
		else
			(subRet += s[c])
				&& c == last && ret.push(subRet);
	}

	return ret;
};


/**
 * Являются ли переданные запросы SELECT'ами
 * @param {String | Array} query - запрос
 * @return {Boolean}
 * */
DBAwwS.prototype.hasOnlySelectQuery = function(query) {
	if (typeof query == "string")
		query = this.splitSQL(query);

	if (!Array.isArray(query))
		throw new Error (`query supposed to be "String" or "Array". "${typeof query}" given`);

	for (let c = 0; c < query.length; c++) {
		if (query[c].trim().match(/^select/i)) continue;

		return false;
	}

	return true;
};


DBAwwS.prototype._createResTpl = function() {
	return {
		"err": "",
		"recs": 0,
		"res": []
	};
};


DBAwwS.prototype._prepReqArgs = function() {
	return {
		"dbCtx":        this,
		"dbmethod":     this.dbmethod,
		"dbname":       this.dbname,
		"dbsrc":        this.dbsrc,
		"dburl":        this.dburl
	};
};


/**
 * @callback DBAwwS~dbQueryCallback
 * @param {Object | null} err - ошибка
 * @param {Object} ctx - контекст выполнения
 * @param {Object} dbres - ответ из базы, в том в котором возвращает AwwS
 * @param {String} dbres.err - ошибки
 * @param {Number} dbres.recs - количество записей
 * @param {Array} dbres.res - строки из базы
 * @param {Array} dbres.fld - поля: название, тип данных
 * */
/**
 * @param {String} arg.query - текст запроса
 * @param {String=} arg.query_b - текст второго запроса для проверки первого, например, в случае отвала соединения
 * @param {String=} arg.dbsrc
 * @param {String=} arg.dbname
 * @param {String=} arg.dbmethod - метод запроса (GET|POST)
 * @param {String=} arg.dburl
 * @param {String=} arg.url
 * @param {String=} arg.dbcache - идентификатор кэша
 * @param {DBAwwS~dbQueryCallback=} arg.callback - функция ответ
 * */
DBAwwS.prototype.dbquery = function(arg) {
	// ----------------------------------------------
	// Входящие параметры
	// ----------------------------------------------
	Va.var(Va.r.obj.type(arg)).throw();
	Va.var(Va.r.str.type(arg.query), Va.r.str.minLen(awwsUtils.trim(arg.query, " "), 1)).throw();

	"query_b" in arg    && Va.var(Va.r.str.type(arg.query_b),   Va.r.str.minLen(arg.query_b,    1)).throw();
	"dbsrc" in arg      && Va.var(Va.r.str.type(arg.dbsrc),     Va.r.str.minLen(arg.dbsrc,      1)).throw();
	"dbmethod" in arg   && Va.var(Va.r.str.type(arg.dbmethod),  Va.r.str.minLen(arg.dbmethod,   1)).throw();
	"dburl" in arg      && Va.var(Va.r.str.type(arg.dburl),     Va.r.str.minLen(arg.dburl,      1)).throw();
	"dbname" in arg     && Va.var(Va.r.str.type(arg.dbname),    Va.r.str.minLen(arg.dbname,     1)).throw();
	"dbcache" in arg    && Va.var(Va.r.str.type(arg.dbcache),   Va.r.str.minLen(arg.dbcache,    4)).throw();

	arg.callback    && Va.var(Va.r.fn.type(arg.callback)).throw();

	var self            = this,
		query_b         = arg.query_b,
		dbsrc           = arg.dbsrc || this.dbsrc,
		dbname          = arg.dbname || this.dbname,
		dbmethod        = (arg.dbmethod && arg.dbmethod.toUpperCase()) || "POST",
		dburl           = arg.url || arg.dburl || self.dburl,
		callback        = arg.callback || new Function(),
		dbCache         = arg.dbcache || "*_ps",

		// Has arguments specified connection? Параметры подключения объявлены в аргументах?
		hasArgSpCn = arg.query || arg.dbsrc || arg.dbname || arg.dbmethod,

		rapidDBreq, dbReq;

	if (!this.awwsCacheEnable) dbCache = "";

	// ----------------------------------------------

	var query           = arg.query,
		queries         = this.splitSQL(query),
		isSelectQuery   = this.hasOnlySelectQuery(queries);

	// Аргументы для запроса
	// ----------------------------------------------
	var _prepReqArgs = () => {
		return {
			"dbCtx":        this,
			"query":        query,
			"dbmethod":     dbmethod,
			"dbname":       dbname,
			"dbsrc":        dbsrc,
			"dbcache":      dbCache,
			"dburl":        dburl
		};
	};

	dbReq = new DBRequest(_prepReqArgs());

	dbReq.reqСount          = 0;
	dbReq.setAutoProp       = 0;
	dbReq.hasArgSpCn        = hasArgSpCn;
	dbReq.queries           = queries;
	dbReq.query_b           = arg.query_b;
	dbReq.on("success", this._onSuccessCallback.bind(this));
	dbReq.on("error", this._onErrorCallback.bind(this));
	dbReq.once("done", this._onDoneCallback.bind(this));

	// Если данный запрос получил ответ быстрей,
	// чем аналогичный ожидающий запрос - Поделиться ответом
	this.rapidCache
	&& this.rapidCache.onRace
	&& isSelectQuery
	&& dbReq.once("success", this._onRapidSuccessCallback.bind(this));

	// Защита пользовательского .bind()
	// Необходимо, чтобы контекст переданный пользователем через .bind() был в приоритете
	dbReq.once("done", function(...args) {
		args[1] = self;
		callback.apply(this, args);
	});

	// RapidCache
	// ----------------------------------------------
	if (this.rapidCache) {
		// Поиск закешированного запроса, который уже выполнен, без ошибок
		if (
			isSelectQuery
			&& this.rapidCache.onHasCache
			&& (rapidDBreq = this._getRapidCacheFineReq(dbReq.encodedData))
		) {
			// Если такой существует копируем его ответ для текущего запроса
			// Прекращаем выполнение
			dbReq.responseData = rapidDBreq.responseData;
			dbReq.state = dbReq.STATE_DONE;
			dbReq.emit("done", null, dbReq, dbReq.responseData);

			return this;
		}

		// Удалить кэшированный запрос по истечении N мсек c момент его завершения
		dbReq.on("done", () => {
			setTimeout(() => {
				this._rmRapidCacheReq(dbReq);
			}, this.rapidCache.timeout);
		});

		isSelectQuery && (this._addRapidCacheReq(dbReq));
	}

	dbReq.send();

	return this;
};


/**
 * Вернуть кешированный запрос по ключу, в котором нет ошибок, который имеет STATE_DONE
 * @param {String} encodedData - ключ - результат метода awwsUtils.encodeQuery()
 * @return {Boolean | undefined | DBAwwsReq}
 * */
DBAwwS.prototype._getRapidCacheFineReq = function(encodedData) {
	var req, reqs, item;

	if (reqs = this._reqStorage[encodedData]) {
		reqs = reqs.values();

		while ((item = reqs.next()) && !item.done) {
			req = item.value;

			if (
				req.state == req.STATE_DONE
				&& !req.error
				&& !req.dbError
				&& !req.httpError
			) {
				return req;
			}
		}
	}
};


/**
 * Добавить запрос в хранилище
 * @param {DBAwwsReq} req
 * @param {*=} set - var
 * @return {DBAwwS}
 * */
DBAwwS.prototype._addRapidCacheReq = function(req, set) {
	if (set = this._reqStorage[req.encodedData]) {
		set.add(req);
		return this;
	}

	this._reqStorage[req.encodedData] = new Set([req]);

	return this;
};


/**
 * Удалить запрос из хранилища
 * @param {DBAwwsReq} req
 * @param {*=} set - var
 * @return {DBAwwS}
 * */
DBAwwS.prototype._rmRapidCacheReq = function(req, set) {
	if (set = this._reqStorage[req.encodedData]) {
		set.delete(req);

		!set.size && (delete this._reqStorage[req.encodedData]);
	}

	return this;
};


/**
 * Обработчик для rapidCache
 * @param {DBRequest} ctx - контекст - экземпляр DBRequest
 * @param {Object} res - ответ от БД
 * @param {*=} reqs - var
 * */
DBAwwS.prototype._onRapidSuccessCallback = function(ctx, res, reqs) {
	// Проверить ожидающие получения запросы
	if (reqs = this._reqStorage[ctx.encodedData]) {
		reqs.forEach((req) => {
			if (req.state != req.STATE_WAITING_RESPONSE) return;

			req.removeAllListeners("success");
			req.removeAllListeners("error");
			req.removeAllListeners("complete");
			req.on("error", () => {});

			req.state = reqs.STATE_DONE;
			req.responseData = res;

			req.emit("done", null, req, res);
		});
	}
};


/**
 * Обработчик ответа для контрольного запроса
 * @param {String} err - ошибки
 * @param {DBRequest} ctx - контекст - экземпляр DBRequest
 * @param {Object} res - ответ от БД
 * */
DBAwwS.prototype._sendBCallback = function(err, ctx, res) {
	if (ctx.httpError) {
		// Контроль вернул http ошибку - повторить основной запрос
		// Повтор, через указанное время
		setTimeout(
			a => ctx.dbReq.send(),
			this.reqAfterFailTimeout
		);

		return;
	}

	if (!res.recs) {
		// Контроль показал что записей нет - повтор запроса
		setTimeout(
			a => ctx.dbReq.send(),
			this.reqAfterFailTimeout
		);

		return;
	}

	var ret = this._createResTpl();

	ctx.dbReq.emit(
		"done",
		null,
		ctx.dbReq,
		ctx.dbReq.queries.length < 2
			? ret
			: new Array(queries.length)
				.fill(ret)
	);
};


/**
 * Обработчик ошибки
 * @param {String} err - ошибки
 * @param {DBRequest} ctx - контекст - экземпляр DBRequest
 * */
DBAwwS.prototype._onErrorCallback = function(err, ctx) {
	// self - ссылка на экземпляр DBAwws

	var self = this,
		res = self._createResTpl(),
		rapidReq;

	res.err = err;

	// reqCount, setAutoProp, query_b, hasArgSpCn

	if (ctx.httpError) {
		// Запрос вернул http ошибку. Нет соединения
		self.emit("requestFail");

		if (
			err == "HTTP_RESPONSE_IS_EMPTY"
			&& this.rapidCache
			&& this.rapidCache.onHttpResponseEmpty
			&& (rapidReq = this._getRapidCacheFineReq(ctx.encodedData))
		) {
			ctx.removeAllListeners("success");
			ctx.removeAllListeners("error");
			ctx.removeAllListeners("complete");
			ctx.on("error", () => {});

			ctx.responseData = rapidReq.responseData;
			ctx.state = ctx.STATE_DONE;

			return ctx.emit("done", null, ctx, ctx.responseData);
		}

		if (ctx.reqСount++ >= self.reqFailRepeats) {
			// Число попыток превышено

			if (!ctx.setAutoProp && !ctx.hasArgSpCn) {
				// ... на текущих настройках - проверить другие доступные настройки, и повторить
				ctx.setAutoProp = 1;

				self.autoConfig({
					"callback": (isOk) => {
						// Если автонастройка не удалась возвращать ошибку
						if (!isOk) {
							ctx.error = "DATABASE CONNECTION FAILED";
							return ctx.emit("done", ctx.error, ctx, res);
						}

						ctx.reqСount = 0;

						ctx.setParams(
							self._prepReqArgs(),
							{
								"dbsrc": self.dbsrc,
								"dbname": self.dbname,
								"dburl": self.dburl
							}
						).send();
					}
				});

				return;
			}

			// ... настройки ничего не дали - прекратить повторы, обьявить ошибку
			self.emit("dbResponseError");
			return ctx.emit("done", err, ctx, res);
		}

		if (ctx.query_b) {
			// Выполнить контрольный запрос
			// На случай если запрос прошел, но сервер некорректно ответил
			var dbReqB = new DBRequest({
				"dburl":    ctx.dburl,
				"dbsrc":    ctx.dbsrc,
				"dbname":   ctx.dbname,
				"dbmethod": ctx.dbmethod,
				"query":    ctx.query_b
			});

			dbReqB.dbReq = ctx;
			dbReqB.on("complete", self._sendBCallback.bind(self)).send();

			return;
		}

		// Повтор, через указанное время
		setTimeout(
			a => ctx.send(),
			self.reqAfterFailTimeout
		);

		return;
	}

	if (ctx.dbError) {
		// Запрос вернул db ошибку. Ошибка на стороне БД
		self.emit("dbResponseError");
		return ctx.emit("done", err, ctx, res);
	}
};


/**
 * Последний слежебный callback, записывет журнал
 * @param {String | null} err - ошибки
 * @param {Object} ctx - контекст запроса
 * */
DBAwwS.prototype._onDoneCallback = function(err, ctx) {
	// self - экземпляр DBAwwS;

	var self = this,
		date = new Date(),
		hour = date.getHours(),
		min = date.getMinutes(),
		sec = date.getSeconds(),

		logStr = '' +
			+ (hour.length < 2 ? '0' + hour : hour)
			+ ':' + (min.length < 2 ? '0' + min : min)
			+ ':' + (sec.length ? '0' + sec : sec)
			+ ' / err: '        + err
			+ ' / r: '          + ctx.reqСount
			+ ' / bt: '         + (self.logUseBacktrace ? new Error().stack : '')
			+ ' / dburl: '      + ctx.dburl
			+ ' / dbsrc: '      + ctx.dbsrc
			+ ' / dbname: '     + ctx.dbname
			+ ' / dbmethod: '   + ctx.dbmethod
			+ ' / query: '      + ctx.query;

	err && self.errors.push(err);

	self.log.push(logStr);

	self.log.length > 100 && self.dblogdir && self.writeLog();

	self.errors.length > 100 && (self.errors = []);
};


/**
 * Обработчик ответа на запрос
 * @param {Object} res - ответ от БД
 * @param {DBRequest} ctx - Контекст - объект запроса
 * */
DBAwwS.prototype._onSuccessCallback = function(ctx, res) {
	// this - контекст db-awws-request

	// Ошибок нет. Плановый ответ
	ctx.emit("done", null, ctx, res);
};


/**
 * @callback DBAwwS~getDBDataCallback
 * */
/**
 * @param {String} arg.query - текст запроса
 * @param {String=} arg.dbsrc
 * @param {String=} arg.dbname
 * @param {String=} arg.query_b - текст второго запроса для проверки первого, например, в случае отвала соединения
 * @param {String=} arg.dbmethod - метод запроса (GET|POST)
 * @param {String=} arg.dburl
 * @param {String=} arg.dbcache - идентификатор кэша
 * @param {Boolean=} arg.selectOnly
 * @param {String=} arg.format - структура ответа
 * @param {DBAwwS~getDBDataCallback=} arg.callback - функция ответ
 * */
DBAwwS.prototype.getDBData = function(arg) {

	if (typeof arg != "object")
		throw new Error(`arg supposed to be "Object". "${typeof arg}" given`);

	var selectOnly = typeof arg.selectOnly == "undefined"
			? false
			: arg.selectOnly,

		format = typeof arg.format == "undefined"
			? "col[row]"
			: arg.format,

		callback = typeof arg.callback == "function"
			? arg.callback
			: new Function();

	// ----------------------------------------------------

	if (selectOnly && !this.hasOnlySelectQuery(arg.query))
		return callback({ info: { errors: "Expected ONLY select queries" } } );

	// ----------------------------------------------------

	arg.callback = function(err, ctx, res) {
		// ....................................
		// Сырой ответ
		if (format == "awws") {
			callback.call(this, err, ctx, res);
			return;
		}

		// ....................................

		var responses = [],
			c, v, b, row, col, colname, row_;

		if (typeof res.push == 'undefined')
			res = [res];

		for (c = 0; c < res.length; c++) {
			var response = {
				"info": {
					"t": -1,
					"t_fx": -1,
					"t_fabula": res[c]['t'],
					"t_jsDecode": -1,
					"num_rows": 0,
					"errors": res[c]['err']
				},
				"recs": []
			};

			if (format == "row[col]") {
				for (v = 0; v < res[c]['res'].length; v++) {
					row = res[c]['res'][v];

					row_ = {};

					for (b = 0; b < row.length; b++) {
						col = row[b];
						colname = res[c]['fld'][b]['Name'];
						row_[colname] = col;
					}

					response.info.num_rows++;

					response.recs.push(row_);
				}

			} else if (format == "col[row]") {
				response.recs = {};

				if (typeof res[c]['fld'] != "undefined") {
					for (v = 0; v < res[c]['fld'].length; v++) {
						response.recs[res[c]['fld'][v]['Name']] = [];
					}

					for (v = 0; v < res[c]['res'].length; v++) {
						row = res[c]['res'][v];

						for (b = 0; b < row.length; b++) {
							col = row[b];
							colname = res[c]['fld'][b]['Name'];
							response.recs[colname][v] = col;
						}

						response.info.num_rows++;
					}
				}
			}

			responses.push(response);
		}

		callback.call(this, responses.length == 1 ? responses[0] : responses);
	};

	// ----------------------------------------------------

	this.dbquery(arg);

	return null;
};


/**
 * Метод записывающий файл журнала
 * @ignore
 * */
DBAwwS.prototype.writeLog = function() {
	var self = this;

	var date = new Date();
	var year = date.getFullYear();
	var month = date.getMonth();
	var day = date.getDate();

	/*
	 * Файл лога год_месяц_день.log
	 * */
	var logfile = '' +
		year +
		'_' +
		(month.length < 2 ? '0' + month : month ) +
		'_' +
		(day.length < 2 ? '0' + day : day  ) +
		".log";

	if (
		typeof self.dblogdir == "string"
		&& self.dblogdir
	) {
		modFs.exists(
			self.dblogdir,
			function(e) {
				if (e) {
					modFs.appendFile(
						modPath.join(self.dblogdir, logfile),
						self.log.join("\n\n") + "\n\n",
						function() {
							self.emit("writeLog");
							self.log = [];
						}
					);
				}
			}
		); // close.exists
	}
};


/**
 * Проверить соединение
 * @param {Object} arg
 * @param {Function} arg.callback
 * @param {String} arg.dburl - ссылка на БД awws. К примеру: "http://localhost:9000/db?"
 * @param {String} arg.dbsrc - источник БД. Например: "main"
 * @param {String} arg.dbname - название БД. Например: "well.demo"
 * */
DBAwwS.prototype.checkConnection = function(arg) {
	if (!arg)
		throw new Error(`1st argument supposed to be "Object". "arg" is "${typeof arg}"`);

	if (typeof arg.callback != "function")
		throw new Error(`arg.callback supposed to be "Function". arg.callback is "${typeof arg}"`);

	var dburl = arg.dburl,
		dbsrc = arg.dbsrc,
		dbname = arg.dbname;

	Ajax.request({
		"method": "post",
		"url": dburl,
		"data": '' +
			'{' +
				'id:0, Conf:"'      + dbname + '", ' +
				'Src:"'             + dbsrc + '", ' +
				'Login:"", '        +
				'Pwd:"", '          +
				'Cache:"'           + awwsBase64.encode("*_connectionTest") + '", ' +
				'Sql:"'             + awwsBase64.encode("SELECT NOW() as Now;") + '"' +
			'}',
		"decodeFrom": "windows-1251",
		"callback": function(httpErr, res) {
			// Если есть ошибки возвращает false;
			if (res.error)
				// Ошибка http подключения
				return arg.callback(false);

			if (!res.responseText)
				// Ответ пустой
				return arg.callback(false);

			res = eval("(" + res.responseText + ")");

			if (res.err)
				// Есть ошибки в БД
				return arg.callback(false);

			if (!res.recs)
				// Число строк = 0
				return arg.callback(false);

			// Соединение установлено
			arg.callback(true);

		} // callback
	}); // Ajax.req
};


/**
 * Автонастройка подключения к БД
 * Принимает массив настроек, подбирает одну рабочую
 * @param {Object} arg - аргументы
 * @param {Function=} arg.callback
 * @param {Array=} arg.dbconfigs - массив доступных настроек
 * */
DBAwwS.prototype.autoConfig = function(arg) {
	if (typeof arg != "object")
		throw new Error(`arg supposed to be "Object". "${typeof arg}" given`);

	var callback = typeof arg.callback == "function"
			? arg.callback
			: new Function(),

		dbconfigs = typeof arg.dbconfigs == "object" && modUtil.isArray(arg.dbconfigs)
			? arg.dbconfigs
			: this.dbconfigs,

		hasSelected = false,
		checksCounter = 0;

	if (!Array.isArray(dbconfigs) || !dbconfigs.length) return;

	dbconfigs.forEach((dbconfig) => {
		if (
			typeof dbconfig.dburl != "string"
			|| typeof dbconfig.dbname != "string"
			|| typeof dbconfig.dbsrc != "string"
		) return;

		this.checkConnection({
			"dburl": dbconfig.dburl,
			"dbsrc": dbconfig.dbsrc,
			"dbname": dbconfig.dbname,
			"callback": res => {
				if (hasSelected) return;

				if (res) {
					// Соединение с БД установлено
					hasSelected = true;

					this.dburl = dbconfig.dburl;
					this.dbsrc = dbconfig.dbsrc;
					this.dbname = dbconfig.dbname;
					this.dblogdir = dbconfig.dblogdir;

					this.emit("autoConfigSuccess");

					callback(true);

					return;
				}

				if (++checksCounter == dbconfigs.length && !hasSelected) {
					// Не удалось подключиться к базе данных
					this.emit("autoConfigFail");
					callback(false);
				}
			}
		});
	}, this);
};


module.exports = DBAwwS;