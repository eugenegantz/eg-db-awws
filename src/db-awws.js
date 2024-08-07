"use strict";

var voidFn          = function() {},
	WebSocket       = require("ws"),
	modPath         = require("path"),
	modFs           = require("fs"),
	Ajax            = require("eg-node-ajax"),
	DBRequest       = require("./db-awws-request.js"),
	awwsBase64      = require("./db-awws-base64.js"),
	awwsUtils       = require("./db-awws-utils.js"),
	Va              = require ("./db-awws-arg-validator.js"),
	modUtil         = require("util"),
	EventEmitter    = require("events");


function _dt(date) {
	return ""
		+ date.getFullYear().toString().slice(2)
		+ "." + (date.getMonth() + 1)
		+ "." + (date.getDate())
		+ " "
		+ date.getHours()
		+ ":" + date.getMinutes();
}


function _toString(value) {
	if (value instanceof Date)
		return _dt(value);

	return [].concat(value).join("");
}


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
	this.loginurl       = null;
	this.loginhash      = null;
	this.loginorigin    = null;
	this.login          = null;
	this.login2         = null;
	this.dburl          = null;
	this.wsurl          = null;
	this.dbname         = null;
	this.dbsrc          = null;
	this.dblogdir       = null;
	this.dbworker       = "";

	this.token          = null;

	// ------------------------

	this.ws                     = null;
	this.log                    = [];
	this.errors                 = [];
	this.reqFailRepeats         = 1;
	this.awwsCacheEnable        = true;
	this.logUseBacktrace        = false;
	this.reqAfterFailTimeout    = 500;
	this._reqStorage            = Object.create(null);
	this.tokenMaxAge            = 1000 * 60 * 60; // 1 час

	// "rapidCache" - возвращает быстрый кэш для одинаковых запросов
	// в течении настроенного времени

	this.rapidCache = {
		"timeout": 2000,
		"onHttpResponseEmpty": false,
		"onRace": false,
		"onHasCache": false
	};

	// В фабуле действует запрет на выбор всех полей - SELECT * FROM ...
	// Предварительно запрашивать список колонок
	this.asteriskPrefetch = false;

	this.instances.push(this);

	// ------------------------
	// Присвоение ключей из аргумента как свойства объекта
	// ------------------------
	arg && Object.keys(arg).forEach((a) => {
		this[a] = arg[a];
	});

	if (this.dblogdir) {
		process.on('beforeExit', this._onProcessExit.bind(this));
		process.on('SIGINT', this._onProcessExit.bind(this));
	}

	this._openSocket();
};


// Наследование событийной модели
modUtil.inherits(DBAwwS, EventEmitter);


DBAwwS.prototype.instances = [];


/**
 * Обработчик на случай завершения программы
 * */
DBAwwS.prototype._onProcessExit = function() {
	this.writeLog();
};


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

	for (var c = 0; c < query.length; c++) {
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


DBAwwS.prototype._openSocket = function() {
	if (!this.wsurl)
		return;

	var _this = this;

	_this.ws = new WebSocket(_this.wsurl);

	_this.ws.onclose = function() {
		setTimeout(_this._openSocket(), 15000);
	};
};


DBAwwS.prototype.send = function(arg) {
	arg = arg || {};

	var value;
	var field;
	var _this       = this;
	var ws          = _this.ws;
	var message     = arg.message || "";
	var fields      = arg.fields;
	var callback    = arg.callback || voidFn;

	if (fields) {
		message = [];

		for (field in fields) {
			value = _toString(fields[field]).trim();

			if (!value)
				continue;

			if (!!~field.indexOf('*'))
				value = awwsBase64.encode(value);

			message.push(field + ':' + value);
		}

		message = message.join("; ");
	}

	if (!message)
		return callback("send(): !arg.message", _this);

	if (!ws)
		return callback(null, _this);

	if (ws.readyState !== 1)
		return callback(null, _this);

	ws.send(message);
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

	arg.callback    && Va.var(Va.r.fn.type(arg.callback)).throw();

	// Если SELECT *
	// deprecated. Фабула более не позволяет запрашивать схему таблиц
	// if (/select\s+(top\s+\d+\s+)?\*/i.test(arg.query) && this.asteriskPrefetch)
		// return this._dbQueryAsteriskPrefetch(arg);

	if (arg.chunked) {
		return this._dbQueryChunked(arg);
	}

	var self            = this,
		argLogs         = arg.logs || {},
		dbworker        = (arg.dbworker || this.dbworker || "").trim(),
		dbsrc           = arg.dbsrc || this.dbsrc,
		dbname          = arg.dbname || this.dbname,
		dbmethod        = (arg.dbmethod && arg.dbmethod.toUpperCase()) || "POST",
		dburl           = arg.url || arg.dburl || self.dburl,
		callback        = arg.callback || new Function(),
		dbCache         = arg.dbcache || "",

		// Параметры подключения объявлены в аргументах?
		hasArgSpCn = arg.query || arg.dbsrc || arg.dbname || arg.dbmethod,

		rapidDBreq, dbReq;

	// автоматическая балансировка запросов
	dbsrc = dbworker + dbsrc;

	// Для удобства журналирования "arg.dbcache" иногда записывается как json
	dbCache = awwsUtils.dbCacheToString(dbCache);

	dbCache = dbCache.padStart(4, "*___");

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

	dbReq.setParams({
		"props": arg.props,
		"token": this.token,
		"reqCount": 0,
		"setAutoProp": 0,
		"hasArgSpCn": hasArgSpCn,
		"logResponse": argLogs.response,
		"queries": queries,
		"query_b": arg.query_b
	});

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

	// Если авторизован - произвести запрос
	if (this.validateToken(this.token)) {
		dbReq.token = this.token;
		dbReq.send();

	} else {
		// Иначе - авторизироваться в БД
		this.auth({
			login: this.login,
			login2: this.login2,
			loginhash: this.loginhash,
			loginorigin: this.loginorigin,
			callback: function(err, token) {
				if (err) {
					// записать журнал
					self._onDoneCallback.call(self, err, dbReq);

					return callback(err, self);
				}

				dbReq.setParams({ "token": token });
				dbReq.send();
			}
		});
	}

	return this;
};

/**
 * Фабула не позволяет выгружать больше 30 000 записей за раз.
 * Потому предсмотрена возможность выгружать итеративно
 *
 * Пример запроса
 * SELECT __TOP__
 *     __IDENTITY__, col1, col2, coln
 * FROM t_table_name
 * WHERE
 *     __WHERE_IDENTITY__
 *     AND col1 > 10
 *     __ORDER_BY__;
 *
 * @param {Object} arg
 * @param {Function} [arg.callback] - callback - (err, _self, dbres) => void
 * @param {String} arg.query - текст запроса
 * @param {Number} [arg.offsetRows=30000] - длина рекордсета
 * @param {String} arg.identityField - поле-ключ, числовой счетчик (id)
 * @private
 */
DBAwwS.prototype._dbQueryChunked = function(arg) {
	var _this       = this;
	var callback    = arg.callback || voidFn;
	var query       = arg.query;
	var page        = 0;
	var offset      = arg.offsetRows || 30000;
	var lastId      = 0;
	var primary     = arg.primaryField;
	var identity    = arg.identityField;
	var _dbRes      = null;

	// deprecated - не поддерживается фабулой
	if (primary) {
		(function _repeatPrimary() {
			var _arg = Object.assign({}, arg);

			_arg.chunked = false;
			_arg.query = query;

			if (!/order\sby/ig.test(query))
				_arg.query += " ORDER BY [" + primary + "] ASC";

			_arg.query += ""
				+ " OFFSET " + (page * offset) + " ROWS"
				+ " FETCH NEXT " + offset + " ROWS ONLY";

			_arg.callback = function(err, _self, dbRes) {
				if (err)
					return callback(err, _self, dbRes);

				if (!_dbRes) {
					_dbRes = dbRes;

				} else {
					_dbRes.res.push.apply(_dbRes.res, dbRes.res);
					_dbRes.recs = _dbRes.res.length;
				}

				if (dbRes.res.length < offset)
					return callback(err, _self, _dbRes);

				++page;

				return _repeatPrimary();
			};

			_this.dbquery(_arg);
		})();
	}

	else if (identity) {
		(function _repeatIdentity() {
			var _arg = Object.assign({}, arg);

			_arg.chunked = false;
			_arg.query = query;

			if (!/__WHERE_IDENTITY__/ig.test(_arg.query)) {
				throw new Error('"__WHERE_IDENTITY__" placeholder in WHERE condition is missing');
			}

			if (!/__IDENTITY__/ig.test(_arg.query)) {
				throw new Error('"__IDENTITY__" placeholder in SELECT statement is missing');
			}

			if (!/__TOP__/ig.test(_arg.query)) {
				throw new Error('"__TOP__" placeholder in SELECT statement is missing');
			}

			if (!/__ORDER_BY__/ig.test(_arg.query)) {
				throw new Error('"__ORDER_BY__" placeholder is missing');
			}

			_arg.query = _arg.query.replace(/__WHERE_IDENTITY__/i, "([" + identity + "] > " + lastId + ")");

			_arg.query = _arg.query.replace(/__ORDER_BY__/i, "ORDER BY [" + identity + "] ASC");

			_arg.query = _arg.query.replace(/__TOP__/i, "TOP " + offset);

			_arg.query = _arg.query.replace(/__IDENTITY__/i, "[" + identity + "]");

			_arg.callback = function(err, _self, dbRes) {
				if (err)
					return callback(err, _self, dbRes);

				var identityIndex;

				if (!_dbRes) {
					_dbRes = dbRes;

				} else {
					_dbRes.res.push.apply(_dbRes.res, dbRes.res);
					_dbRes.recs = _dbRes.res.length;
				}

				_dbRes.fld.some(function(field, index) {
					if (field.Name.toLowerCase() == identity.toLowerCase()) {
						identityIndex = index;
						return true;
					}

					return false;
				});

				lastId = _dbRes.res[_dbRes.res.length - 1][identityIndex];

				if (dbRes.res.length < offset) {
					return callback(err, _self, _dbRes);
				}

				return _repeatIdentity();
			};

			_this.dbquery(_arg);
		})();
	}
};


DBAwwS.prototype._dbQueryAsteriskPrefetch = function(arg) {
	var _this           = this;
	var queries         = this.splitSQL(arg.query);
	var tableNames      = [];

	function _getTableName(query) {
		return query
			.match(/FROM\s+\[?[a-z0-9_~]+\]?/i)
			.toString()
			.replace(/FROM\s*/i, "")
			.replace(/[\[\]]/ig, "")
			.toUpperCase();
	}

	queries.forEach(function(query) {
		tableNames.push("'" + _getTableName(query) + "'");
	});

	var columnsQuery = "SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME IN (" + tableNames + ")";

	_this.dbquery({
		"query": columnsQuery,
		"callback": function(err, _self, dbRes) {
			var _arg;
			var query;
			var columns = {};

			dbRes.res.forEach(function(row) {
				var tableName = row[0].toUpperCase();
				var columnName = row[1];

				columns[tableName] = columns[tableName] || [];
				columns[tableName].push("[" + columnName + "]");
			});

			query = queries.map(function(query) {
				var t = _getTableName(query);

				return query.replace("*", columns[t]);
			});

			query = query.join("; ");

			_arg = Object.assign({}, arg, { "query": query });

			_this.dbquery(_arg);
		}
	});
};


/**
 * Авторизировать пользователя в БД. Вернуть токен
 *
 * @param {Object} arg
 * @param {Function=} arg.callback
 * @param {String} arg.login
 * @param {String} arg.login2
 * @param {String} arg.loginhash
 * @param {String} arg.loginorigin
 * */
DBAwwS.prototype.auth = function(arg) {
	arg = arg || {};

	var self        = this,
	    now         = new Date(),
	    callback    = arg.callback || voidFn;

	var data = awwsUtils.encodeLogin({
		"dbname": this.dbname,
		"login": arg.login,
		"login2": arg.login2,
		"loginhash": arg.loginhash,
		"loginorigin": arg.loginorigin,
		"tm": now.getHours() + ":" + now.getMinutes()
	});

	Ajax.request({
		"url": this.loginurl,
		"method": "GET",
		"data": data,
		"decodeFrom": "windows-1251",
		callback: function(err, res) {
			if (err)
				return callback(err);

			var token = eval('(' + res.responseText + ')');

			if (token.Err)
				return callback(token.Err);

			token.date = new Date();

			callback(null, self.token = token);
		}
	});
};


/**
 * Проверить актуальность токена
 *
 * @param {Object} token
 *
 * @return {Boolean}
 * */
DBAwwS.prototype.validateToken = function(token) {
	// Сервер фабулы принудительно инвалидирует токены в полночь
	// Время инвалидации на сервере
	var zeroDate = new Date;

	// Установить время на полночь
	// Установить время на минуту позже полуночи,
	// на случай если фабула инвалидирует токен не ровно в полночь
	zeroDate.setHours(0);
	zeroDate.setMinutes(1);
	zeroDate.setSeconds(0);
	zeroDate.setMilliseconds(0);

	// Если токена нет
	if (!token || typeof token != 'object')
		return false;

	// Если токен получен до полуночи - считать токен устаревшим
	if (token.date - zeroDate <= 0)
		return false;

	// Если срок токена не истек
	return Math.abs(token.date - new Date()) < this.tokenMaxAge;
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

		if (ctx.reqCount++ >= self.reqFailRepeats) {
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

						ctx.reqCount = 0;

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

	// Запрос вернул db ошибку. Ошибка на стороне БД
	if (ctx.dbError) {
		var requestsToRepeat = {};

		var _onDone = function() {
			if (Object.keys(requestsToRepeat).length)
				return;

			err = (ctx.dbError + '') || null;

			if (!err)
				res = ctx.responseData;

			self.emit("dbResponseError");
			ctx.emit("done", err, ctx, res);
		};

		ctx.dbError.forEach(dbErr => {
			let shouldRepeat = 0;

			let dbErrStr = dbErr + '';

			if (/установлена\sблокировка/ig.test(dbErrStr))
				shouldRepeat = 1;

			if (/блокировка\sустановлена\sпользователем/ig.test(dbErrStr))
				shouldRepeat = 1;

			if (/Недопустимая\sзакладка/ig.test(dbErrStr))
				shouldRepeat = 1;

			if (!shouldRepeat)
				return;

			var index = dbErr.index,
				query = dbErr.query;

			var dbReqRepeat = new DBRequest({
				"dburl"     : ctx.dburl,
				"dbsrc"     : ctx.dbsrc,
				"dbname"    : ctx.dbname,
				"dbmethod"  : ctx.dbmethod,
				"dbcache"   : ctx.dbcache,
				"query"     : query
			});

			requestsToRepeat[index] = dbReqRepeat;

			// Задерждка 1 сек
			// Чтобы позволить базе разблокировать таблицу
			setTimeout(function() {
				var _onComplete = function() {
					delete requestsToRepeat[index];

					_onDone();
				};

				// Закрыть просроченные запросы
				setTimeout(function() {
					// _onComplete();
				}, 15000);

				dbReqRepeat.send({
					"onSuccess": function(dbReq, dbRes) {
						if (!requestsToRepeat[index])
							return;

						// Чтобы отразить в журнале
						dbRes.isFailOverReq = 1;

						Array.isArray(ctx.responseData)
							? ctx.responseData[index] = dbRes
							: ctx.responseData = dbRes;

						delete ctx.dbError[index];

						_onComplete();
					},
					"onError": function(dbReq, _err) {
						if (!requestsToRepeat[index])
							return;

						ctx.dbError[index] = _err;

						_onComplete();
					}
				});
			}, 1000);
		});

		_onDone();
	}
};


/**
 * Последний слежебный callback, записывет журнал
 * @param {String | null} err - ошибки
 * @param {Object} ctx - контекст запроса
 * */
DBAwwS.prototype._onDoneCallback = function(err, ctx) {
	// self - экземпляр DBAwwS;

	var logStr,
	    logObj,
	    self                = this,
	    resData             = [].concat(ctx.responseData),
	    failOverReqIdx      = [],
	    t                   = [],
	    recs                = [],
	    res                 = [],
	    date                = new Date();

	resData.forEach((row, idx) => {
		if (!row)
			return;

		if (row.isFailOverReq)
			failOverReqIdx.push(idx);

		recs.push(row.recs);
		res.push(row.res);

		t.push(row.t);
	});

	logObj = {
		"err"               : err,
		"date"              : date,
		"r"                 : ctx.reqCount,
		"recs"              : recs.join(", "),
		"res"               : null,
		"t"                 : t.join(", "),
		"failOverReqIdx"    : failOverReqIdx.join(", "),
		"bt"                : "",
		"dburl"             : ctx.dburl,
		"dbsrc"             : ctx.dbsrc,
		"dbname"            : ctx.dbname,
		"dbcache"           : ctx.dbcache || "",
		"dbmethod"          : ctx.dbmethod,
		"query"             : ctx.query
	};

	// журналировать ответ
	if (ctx.logResponse)
		logObj.res = res;

	// журналировать стек вызова
	if (self.logUseBacktrace)
		logObj.bt = new Error().stack;

	logStr = JSON.stringify(logObj);

	if (err)
		self.errors.push(err);

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
				'Sql:"'             + awwsBase64.encode("SELECT 1") + '"' +
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
					this.dbworker = dbconfig.dbworker || "";

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