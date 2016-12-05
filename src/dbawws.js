var modPath         = require("path"),
	modFs           = require("fs"),
	Ajax            = require("eg-node-ajax"),
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
	this._rapidCacheStorage = Object.create(null);

	// "rapidCache" - возвращает быстрый кэш для одинаковых запросов
	// в течении настроенного времени
	// По умолчанию отключен
	this.rapidCache = void 0;

	/*
	// Пример настройки
	this.rapidCache = [
		{
			"timeout": 2000, // ПАРАМЕТР
			"ifEmptyResponse": true, // ИЛИ
			"ifSameClient": true // ИЛИ
		}, // И
		{
			"timeout": 8000, // ПАРАМЕТР
			"ifEmptyResponse": false // ИЛИ
		} // И
	];
	*/

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
 * Самописное Base64 шифрование
 * */
DBAwwS.prototype.Base64 = {
	"_keyStr": "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

	/**
	 * Закодировать строку в base64
	 * @param {String} input
	 * @return {String}
	 * */
	"encode": function(input) {
		if (!input) return "";

		var chr1, chr2, chr3, enc1, enc2, enc3, enc4,
			i = 0,
			output = "";

		input = this._utf8_encode(input);

		while (i < input.length) {
			chr1 = input.charCodeAt(i++);
			chr2 = input.charCodeAt(i++);
			chr3 = input.charCodeAt(i++);
			enc1 = chr1 >> 2;
			enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
			enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
			enc4 = chr3 & 63;

			if (isNaN(chr2))  enc3 = enc4 = 64;
			else if (isNaN(chr3)) enc4 = 64;

			output += this._keyStr.charAt(enc1) +
					this._keyStr.charAt(enc2) +
					this._keyStr.charAt(enc3) +
					this._keyStr.charAt(enc4);
		}

		return output.substr(4, 1) + output;
	},

	"_utf8_encode": function(string) {
		string = string.replace(/\r\n/g, "\n");

		var c, n, utftext = "";

		for (n = 0; n < string.length; n++) {
			c = string.charCodeAt(n);

			if (c < 128)
				utftext += String.fromCharCode(c);

			else if ((c > 127) && (c < 2048)) {
				utftext += String.fromCharCode((c >> 6) | 192);
				utftext += String.fromCharCode((c & 63) | 128);

			} else {
				utftext += String.fromCharCode((c >> 12) | 224);
				utftext += String.fromCharCode(((c >> 6) & 63) | 128);
				utftext += String.fromCharCode((c & 63) | 128);
			}
		}

		return utftext;
	}
};


/**
 * Формирует запрос в формате AwwS (JSON без кавычек)
 * @param {Object} arg
 * @param {String} arg.dbmethod - метод запроса POST|GET
 * @param {String} arg.dbname
 * @param {String} arg.dbsrc
 * @param {String} arg.cache - название кэша (прим.*_ps123)
 * @param {String} arg.query - текст запроса
 * */
DBAwwS.prototype.encodeQuery = function(arg) {
	var dbmethod = arg.dbmethod.toUpperCase(),
		s = [
			"id:0",
			"Conf:\""       + arg.dbname + "\"",
			"Src:\""        + arg.dbsrc + "\"",
			"Login:\"\"",
			"Pwd:\"\"",
			"Cache:\""      + this.Base64.encode(arg.dbcache) + "\"",
			"Sql:\""        + this.Base64.encode(arg.query) + "\""
		];

	s = "{" + s.join(",") + "}";

	if (dbmethod == "POST")
		return s;

	if (dbmethod == "GET")
		return this.Base64.encode(s);
};


/**
 * Разбить строку пакетного запроса на массив одиночных
 * @param {String} s - текст запроса
 * @return {Array}
 * */
DBAwwS.prototype.splitSQL = function(s) {
	s = this
			._utils.trim(s, ' ;\\t\\n\\r\\0\\x0B')
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


/**
 * @callback DBAwwS~dbQueryCallback
 * @param {Object} dbres - ответ из базы, в том в котором возвращает AwwS
 * @param {String} dbres.err - ошибки
 * @param {Number} dbres.recs - количество записей
 * @param {Array} dbres.res - строки из базы
 * @param {Array} dbres.fld - поля: название, тип данных
 * */
/**
 * @param {String} arg.query - текст запроса
 * @param {String=} arg.dbsrc
 * @param {String=} arg.dbname
 * @param {String=} arg.query_b - текст второго запроса для проверки первого, например, в случае отвала соединения
 * @param {String=} arg.dbmethod - метод запроса (GET|POST)
 * @param {String=} arg.dburl
 * @param {String=} arg.dbcache - идентификатор кэша
 * @param {DBAwwS~dbQueryCallback=} arg.callback - функция ответ
 * */
DBAwwS.prototype.dbquery = function(arg) {
	// ----------------------------------------------
	// Входящие параметры
	// ----------------------------------------------
	if (typeof arg != "object")
		throw new Error(`arg supposed to be "Object". "${typeof arg}" given`);

	var self        = this,
		query_b     = typeof arg.query_b == "string" && arg.query_b ? arg.query_b : null,
		dbsrc       = typeof arg.dbsrc == "string" && arg.dbsrc ? arg.dbsrc : this.dbsrc,
		dbname      = typeof arg.dbname == "string" && arg.dbname ? arg.dbname : this.dbname,
		dbmethod    = typeof arg.dbmethod == "string" && arg.dbmethod ? arg.dbmethod.toUpperCase() : "POST",
		url         = arg.url || arg.dburl || self.dburl || null,
		callback    = typeof arg.callback == "function" ? arg.callback : new Function(),
		dbCache     = typeof arg.dbcache == "string" && arg.dbcache.length > 4 ? arg.dbcache : "*_ps",
		isSelectQuery = this.hasOnlySelectQuery(arg.query);

	if (typeof arg.query != "string")
		throw new Error(`arg.query supposed to be "String". "${typeof arg}" given`);

	if (!arg.query)
		throw new Error(`arg.query is empty`);

	var query = arg.query;

	// ----------------------------------------------

	if (!url || !dbsrc || !dbname) {
		self.autoConfig({
			"callback": function(res) {
				if (res) {
					reqСount = 0;
					self.dbquery(arg);
				} else {
					callback({ "err": "!dburl || !dbname || !dbsrc", "recs": 0, "res": [] });
				}
			}
		});

		return;
	}

	// ----------------------------------------------
	// Запрос
	// ----------------------------------------------
	if (!this.awwsCacheEnable) dbCache = "";

	// Счетчик повторения запросов
	var reqСount = 0,
		setAutoProp = 0,
		error = '',

		data = this.encodeQuery({
			"query": query,
			"dbmethod": dbmethod,
			"dbname": dbname,
			"dbsrc": dbsrc,
			"dbcache": dbCache
		});

	// var AutoConfigDone = 0;

	var req = function() {
		Ajax.request({
			"method": dbmethod,
			"url": url,
			"data": data,
			"decodeFrom": "windows-1251",
			"callback": function(httpErr, httpRes) {
				var dbres = {
					"err": "",
					"recs": 0,
					"res": [],
					"fld": []
				};

				reqСount++;

				// Ошибки запроса?
				if (!httpRes.error) {
					// TODO if !sdbres

					try {
						// Содержимое ответа из БД
						dbres = eval("(" + httpRes.responseText + ")");

					} catch (err) {
						if (typeof err.stack == "string") {
							dbres.err = err.stack;
							console.log(err.stack, httpRes);
						}
					}

					// Вернулся массив?
					// На случай пакетного запроса
					if (!Array.isArray(dbres)) {
						dbres.err && self.errors.push(dbres.err);
						error = dbres.err;

					} else {
						var tmp = [];

						for (var c = 0; c < dbres.length; c++) {
							if (dbres[c].err) {
								var tmp2 = self._utils.trim(dbres[c].err, " ;") + '(' + (c + 1) + ')';
								tmp.push(tmp2);
								self.errors.push(tmp2);
							}
						}

						error = tmp.join('; ');
					}

					callback(dbres);

				} else {
					self.emit("requestFail");

					// Есть ошибки в запросе
					// Лимит повторов достигнут?
					if (reqСount < self.reqFailRepeats) {
						if (query_b) {
							Ajax.request({
								"method": dbmethod,
								"url": url,
								"data": data,
								"decodeFrom": "windows-1251",
								"callback": function(httpErrB, httpResB) {

									var dbResB = {
										"err": "",
										"recs": 0,
										"res": [],
										"fld": []
									};

									if (!httpResB.error) {
										try {
											dbResB = eval("(" + httpResB.responseText + ")");

										} catch (err) {
											if (typeof err.stack == "string") {
												dbResB.err = err.stack;
												console.log(err.stack);
											}

										}

										if (!dbResB.recs) {
											setTimeout(
												function() {
													req();
												},
												self.reqAfterFailTimeout
											);

										} else {
											callback({
												"res": [],
												"recs": 0,
												"err": httpRes.error,
												"fld": []
											});
										}

									} else {
										setTimeout(
											function() {
												req();
											},
											self.reqAfterFailTimeout
										);
									}

								}
							});

						} else {
							setTimeout(
								function() {
									req();
								},
								self.reqAfterFailTimeout
							);
						}

					} else {
						self.errors.push(httpRes.error);

						dbres.err = httpRes.error;

						error = httpRes.error;

						// Перенастройка БД сервера
						if (!setAutoProp) {
							setAutoProp = 1;
							self.autoConfig({
								"callback": function() {
									reqСount = 0;
									req();
								}
							});

						} else {
							setAutoProp = 0;
							callback(dbres);
							console.log("Не удалось подключиться к БД");
						}
					}
				}

				// ----------------------------------------------
				// Событие, запрос с ошибкой
				// ----------------------------------------------
				error && self.emit("dbResponseError");

				// ----------------------------------------------
				// Логи
				// Если не указана папка для журнала, жарнал в файл не пишется
				// ----------------------------------------------
				var date = new Date(),
					hour = date.getHours(),
					min = date.getMinutes(),
					sec = date.getSeconds();

				var logStr = ''
					+ (hour.length < 2 ? '0' + hour : hour) + ':' + (min.length < 2 ? '0' + min : min) + ':' + (sec.length ? '0' + sec : sec)
					+ ' / err: '        + error
					+ ' / r: '          + reqСount
					+ ' / bt: '         + (self.logUseBacktrace ? new Error().stack : '')
					+ ' / dburl: '      + url
					+ ' / dbsrc: '      + dbsrc
					+ ' / dbname: '     + dbname
					+ ' / dbmethod: '   + dbmethod
					+ ' / query: '      + query;

				self.log.push(logStr);

				self.log.length > 100 && self.dblogdir && self.writeLog();

			} // close.Ajax.req.callback
		});
	};

	req();

	// ----------------------------------------------
	// Ошибки
	// ----------------------------------------------
	this.errors.length > 100 && (this.errors = []);

	return null;
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

	arg.callback = function(res) {
		// ....................................
		// Сырой ответ
		if (format == "awws") {
			callback(res);
			return;
		}

		// ....................................

		var responses = [],
			c, v, b, row, col, colname;

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

					var row_ = {};

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

		callback(responses.length == 1 ? responses[0] : responses);
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

	var self = this,
		dburl = arg.dburl,
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
				'Cache:"'           + self.Base64.encode("*_connectionTest") + '", ' +
				'Sql:"'             + self.Base64.encode("SELECT NOW() as Now;") + '"' +
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
 * @param {Array} arg.dbconfigs - массив доступных настроек
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


DBAwwS.prototype._utils = {
	/**
	 * @param {String} str - ввод строка
	 * @param {String} ch - символы, которые необходимо срезать
	 * @param {String=} di - "L" => LTRIM, "R" => RTRIM, "" => TRIM
	 * @return {String}
	 * */
	"trim": function(str, ch, di) {
		var regEx = [];

		(!di || di == "L") && regEx.push("^[" + ch + "]+");

		(!di || di == "R") && regEx.push("[" + ch + "]+$");

		return str.replace(new RegExp(regEx.join("|"), "g"), "");
	}
};


module.exports = DBAwwS;