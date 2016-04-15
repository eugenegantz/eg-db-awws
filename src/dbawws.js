	var modPath = require("path");
	var modFs  = require("fs");
	var Ajax = require("eg-node-ajax");
	var modUtil = require("util");
	var EventEmitter = require("events");
	var lodash = require("lodash");


	/**
	 * @constructor
	 * @module eg-db-awws
	 * */
	var DBAwwS = function(){

		EventEmitter.call(this);

		// ........................................................
		// Не изменять ключи, через них могут взаимодействовать другие программы

		this.dbconfigs = [];
		this.dburl =  null;
		this.dbname = null;
		this.dbsrc = null;
		this.dblogdir = null;

		// ........................................................

		this.errors = [];

		this.awwsCacheEnable = true;

		this.reqFailRepeats = 1;

		this.reqAfterFailTimeout = 500;

		this.log = [];

		this.logUseBacktrace = false;

		this.instances.push(this);

	};

	// Наследование событийной модели
	modUtil.inherits(DBAwwS, EventEmitter);

	DBAwwS.prototype.instances = [];


	/**
	 * Получить экземпляр
	 * */
	DBAwwS.prototype.getInstance = function(arg){
		return this.instances.length ? this.instances[0] : new DBAwwS(arg);
	};


	/**
	 * Самописное Base64 шифрование
	 * */
	DBAwwS.prototype.Base64 = {
		"_keyStr" : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

		"encode" : function (input){
			if ( !input ) return "";
			var i = 0, output = "", chr1, chr2, chr3, enc1, enc2, enc3, enc4;
			input = this._utf8_encode(input);
			while (i < input.length){
				chr1 = input.charCodeAt(i++);
				chr2 = input.charCodeAt(i++);
				chr3 = input.charCodeAt(i++);
				enc1 = chr1 >> 2;
				enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
				enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
				enc4 = chr3 & 63;
				if ( isNaN(chr2) )  enc3 = enc4 = 64;
				else if ( isNaN(chr3) ) enc4 = 64;
				output += this._keyStr.charAt(enc1) + this._keyStr.charAt(enc2) + this._keyStr.charAt(enc3) + this._keyStr.charAt(enc4);
			}
			return output.substr(4,1) + output;
		},

		"_utf8_encode" : function (string) {
			string = string.replace(/\r\n/g,"\n");
			var utftext = "";
			for (var n = 0; n < string.length; n++){
				var c = string.charCodeAt(n);
				if ( c < 128 )
				  utftext += String.fromCharCode(c);
				else if ( (c > 127) && (c < 2048) ){
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
	DBAwwS.prototype.encodeQuery = function(arg){

		var dbmethod = arg.dbmethod.toUpperCase();

		var s = [
			"id:0",
			"Conf:\"" + arg.dbname + "\"",
			"Src:\"" + arg.dbsrc + "\"",
			"Login:\"\"",
			"Pwd:\"\"",
			"Cache:\"" + this.Base64.encode(arg.dbcache) + "\"",
			"Sql:\"" + this.Base64.encode(arg.query) + "\""
		];

		s = "{"+s.join(",")+"}";

		if ( dbmethod == 'POST' ){
			return s;

		} else if ( dbmethod == 'GET' ){
			return this.Base64.encode(s);

		}

	};


	/**
	 * Разбить строку пакетного запроса на массив одиночных
	 * @param {String} s - текст запроса
	 * @return {Array}
	 * */
	DBAwwS.prototype.splitSQL = function(s){
		var c;

		for(c=0; c<2; c++){
			s = lodash.trim(s, ' ;\t\n\r\0\x0B');
		}

		s = s.split('');

		var L = s.length;
		var q = '';

		for (c=0; c<L; c++) {
			if (
				(
					s[c] == '"'
					|| s[c] == "'"
				)
				&& (
					s[c-1] != "\\"
					|| (
						s[c-1] == "\\"
						&& s[c-2] == "\\"
					)
				)
			){
				if (q == s[c]){
					q = '';
				} else {
					q = s[c];
				}
			}

			if (s[c] == ';' && !q){
				s[c] = ';[[[*SPLIT*]]]';
			}
		}

		return s.join('').split(';[[[*SPLIT*]]]');
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
	 * @param {String} arg.dbsrc
	 * @param {String} arg.dbname
	 * @param {String} arg.query_b - текст второго запроса для проверки первого, например, в случае отвала соединения
	 * @param {String} arg.dbmethod - метод запроса (GET|POST)
	 * @param {String} arg.dburl
	 * @param {String} arg.dbcache - идентификатор кэша
	 * @param {DBAwwS~dbQueryCallback} arg.callback - функция ответ
	 * */
	DBAwwS.prototype.dbquery = function(arg){
		// var iconv_lite = require("iconv-lite");

		// ----------------------------------------------
		// Входящие параметры

		var self = this;

		arg 				= typeof arg == "undefined" ? Object.create(null) : arg;
		var query_b 	= typeof arg.query_b == "string" && arg.query_b ? arg.query_b : null;
		var dbsrc 		= typeof arg.dbsrc == "string" && arg.dbsrc ? arg.dbsrc : this.dbsrc;
		var dbname 		= typeof arg.dbname == "string" && arg.dbname ? arg.dbname : this.dbname;
		var dbmethod 	= typeof arg.dbmethod == "string" && arg.dbmethod ? arg.dbmethod.toUpperCase() : "POST";
		var url 			= arg.url || arg.dburl || self.dburl || null;
		var callback 	= typeof arg.callback == "function" ? arg.callback : new Function();
		var dbCache 	= typeof arg.dbcache == "string" && arg.dbcache.length > 4 ? arg.dbcache : "*_ps";

		if (typeof arg.query != "string"){
			throw new Error("arg.query suppose to be String");
		}

		if (!arg.query){
			throw new Error("!arg.query");
		}

		var query = arg.query;

		// ----------------------------------------------

		if (!url || !dbsrc || !dbname) {
			self.autoConfig({
				"callback" : function(res){
					if (  res  ){
						reqСount = 0;
						self.dbquery(arg);
					} else {
						callback({"err":"!dburl || !dbname || !dbsrc", "recs":0, "res":[]});
					}
				}
			});
			return;
		}

		// ----------------------------------------------
		// Запрос

		if ( !this.awwsCacheEnable ) dbCache = "";

		var data = this.encodeQuery({
			"query":query,
			"dbmethod": dbmethod,
			"dbname": dbname,
			"dbsrc": dbsrc,
			"dbcache": dbCache
		});

		// Счетчик повторения запросов
		var reqСount = 0;

		// var AutoConfigDone = 0;

		var setAutoProp = 0;

		var error = '';

		var req = function(){
			Ajax.request({
				"method": dbmethod,
				"url": url,
				"data": data,
				"decodeFrom": "windows-1251",
				"callback": function(httpErr, httpRes){

					var dbres = {
						"err":"",
						"recs":0,
						"res":[],
						"fld":[]
					};

					reqСount++;

					// Ошибки запроса?
					if (!httpRes.error){

						try {
							// Содержимое ответа из БД
							dbres = eval("("+httpRes.responseText+")");

						} catch (err) {
							if (typeof err.stack == "string"){
								dbres.err = err.stack;
								console.log(err.stack);
							}

						}

						// Вернулся массив?
						// На случай пакетного запроса
						if (  !Array.isArray(dbres)  ){
							if (  dbres.err  ) self.errors.push(dbres.err);
							error = dbres.err;

						} else {
							var tmp = [];
							for (var c=0; c<dbres.length; c++) {
								if (  dbres[c].err  ){
									var tmp2 = lodash.trim(dbres[c].err," ;") + '('+(c+1)+')';
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
						if ( reqСount < self.reqFailRepeats ){
							if (  query_b  ){

								/*
								var data_b = this_.encodeQuery({
									"query":query_b,
									"dbmethod": dbmethod,
									"dbname": dbname,
									"dbsrc": dbsrc,
									"dbcache": dbCache+"_bpass"+req_count
								});
								*/

								Ajax.request({
									"method" : dbmethod,
									"url" : url,
									"data": data,
									"decodeFrom": "windows-1251",
									"callback" : function(httpErrB, httpResB){

										var dbResB = {
											"err":"",
											"recs":0,
											"res":[],
											"fld":[]
										};

										if (!httpResB.error){

											try {
												dbResB = eval("("+httpResB.responseText+")");

											} catch (err) {
												if (typeof err.stack == "string"){
													dbResB.err = err.stack;
													console.log(err.stack);
												}

											}

											if (!dbResB.recs){
												setTimeout(
													function(){
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
												function(){
													req();
												},
												self.reqAfterFailTimeout
											);
										}

									}
								});

							} else {

								setTimeout(
									function(){
										req();
									},
									self.reqAfterFailTimeout
								);

							}

						} else {

							self.errors.push(httpRes.error);

							dbres.err = httpRes.error;

							/*
							dbres = {
								"res": [],
								"recs": 0,
								"err": httpRes.error,
								"fld": []
							};
							*/

							error = httpRes.error;

							// Перенастройка БД сервера
							if ( !setAutoProp ){
								setAutoProp = 1;
								self.autoConfig({
									"callback" : function(){
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
					self.emit("dbResponseError");

					// ----------------------------------------------
					// Логи
					// Если не указана папка для журнала, жарнал не пишется

					if (  self.dblogdir  ){
						var date = new Date();
						var hour = date.getHours();
						var min = date.getMinutes();
						var sec =date.getSeconds();

						var logStr = ''
						+(hour.length<2 ? '0'+hour : hour)+':'+(min.length<2 ? '0'+min : min)+':'+(sec.length ? '0'+sec : sec)
						+' / err: '		+error
						+' / r: '			+reqСount
						+' / bt: '			+(self.logUseBacktrace ? new Error().stack : '')
						+' / dburl: '		+url
						+' / dbsrc: '	+dbsrc
						+' / dbname: '	+dbname
						+' / dbmethod: '+dbmethod
						+' / query: '	+query;

						self.log.push(logStr);

						if (self.log.length > 100){
							self.writeLog();
						}
					}

				} // close.Ajax.req.callback
			});
		};

		req();

		// ----------------------------------------------
		// Ошибки
		if (  this.errors.length > 100  ){
			this.errors = [];
		}

		return null;
	};


	/**
	 * @callback DBAwwS~getDBDataCallback
	 * */
	/**
	 * @param {String} arg.query - текст запроса
	 * @param {String} arg.dbsrc
	 * @param {String} arg.dbname
	 * @param {String} arg.query_b - текст второго запроса для проверки первого, например, в случае отвала соединения
	 * @param {String} arg.dbmethod - метод запроса (GET|POST)
	 * @param {String} arg.dburl
	 * @param {String} arg.dbcache - идентификатор кэша
	 * @param {DBAwwS~getDBDataCallback} arg.callback - функция ответ
	 * */
	DBAwwS.prototype.getDBData = function(arg){

		arg					= typeof arg == "undefined" ? Object.create(null) : arg;
		var selectOnly 	= typeof arg.selectOnly == "undefined" ? false : arg.selectOnly;
		var format 			= typeof arg.format == "undefined" ? "col[row]" : arg.format;
		var callback			= typeof arg.callback == "function" ? arg.callback : new Function();

		// ----------------------------------------------------

		if (  selectOnly  ){

			var SQL = query;

			SQL = this.splitSQL(SQL);

			for(var c=0; c<SQL.length; c++){
				SQL[c] = SQL[c].trim();
				var sn = SQL[c].split(" ");
				if (sn[0].toLowerCase() != 'select'){
					callback();
					return;
				}
			}

		}

		// ----------------------------------------------------

		arg.callback = function(res){

			// TODO Иметь ввиду что возможно в будущем прийдется возвращать обьекты без прототипа

			// ....................................
			// Сырой ответ
			if (format == "awws"){
				callback(res);
				return;
			}

			// ....................................

			var responses = [];
			var c, v, b, row, col, colname;

			if (typeof res.push == 'undefined'){
				res = [res];
			}

			for (c=0; c<res.length; c++) {
				var response = {
					"info" : {
						"t" : -1,
						"t_fx" : -1,
						"t_fabula" : res[c]['t'],
						"t_jsDecode" : -1,
						"num_rows" : 0,
						"errors" : res[c]['err']
					},
					"recs" : []
				};

				if (  format == "row[col]"  ){
					for (v=0; v<res[c]['res'].length; v++){
						row = res[c]['res'][v];

						var row_ = {};

						for (b=0; b<row.length; b++){
							col = row[b];
							colname = res[c]['fld'][b]['Name'];
							row_[colname] = col;
						}

						response.info.num_rows++;

						response.recs.push(row_);
					}

				} else if (  format == "col[row]"  ) {
					response.recs = {};

					if ( typeof res[c]['fld'] != "undefined" ){
						for (v=0; v<res[c]['fld'].length; v++) {
							response.recs[res[c]['fld'][v]['Name']] = [];
						}

						for (v=0; v<res[c]['res'].length; v++){
							row = res[c]['res'][v];

							for (b=0; b<row.length; b++){
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
	 * @ignore
	 * */
	DBAwwS.prototype.writeLog = function(){
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
				function(e){
					if (e){
						modFs.appendFile(
							modPath.join(self.dblogdir,logfile),
							self.log.join("\n\n") + "\n\n",
							function(){
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
	 * */
	DBAwwS.prototype.checkConnection = function(arg){

		if ( typeof arg == "undefined") arg = Object.create(null);
		if ( typeof arg.callback == "undefined") arg.callback = new Function();

		var dburl = arg.dburl;
		var dbsrc = arg.dbsrc;
		var dbname = arg.dbname;

		var self = this;

		Ajax.request({
			"method": "post",
			"url": dburl,
			"data": '{id:0, Conf:"' + dbname + '", Src:"' + dbsrc + '", Login:"", Pwd:"", Cache:"' + self.Base64.encode("*_connectionTest") + '", Sql:"' + self.Base64.encode("SELECT NOW() as Now;") + '"}',
			"decodeFrom": "windows-1251",
			"callback" : function(httpErr, res){
				// Если есть ошибки возвращает false;

				if ( !res.error ){

					if ( !res.responseText ){
						// Ответ пустой
						arg.callback(false);

					} else {
						res = eval("(" + res.responseText + ")");

						if (res.err){
							// Есть ошибки в БД
							arg.callback(false);

						} else if (!res.recs){
							// Число строк = 0
							arg.callback(false);

						} else {
							// Соединение установлено
							arg.callback(true);

						}

					}

				} else {
					// Ошибка http подключения
					arg.callback(false);

				}
			} // callback
		}); // Ajax.req

	};


	DBAwwS.prototype.autoConfig = function (arg) {

		var modUtil = require("util");

		if (typeof arg == "undefined") arg = Object.create(null);

		var dbconfigs = typeof arg.dbconfigs == "object" && modUtil.isArray(arg.dbconfigs)
			? arg.dbconfigs
			: this.dbconfigs;

		var callback = typeof arg.callback == "function" ? arg.callback : new Function();

		var self = this;
		// --------------------------------------------------

		if (!Array.isArray(dbconfigs) || !dbconfigs.length ) return;

		// --------------------------------------------------

			var selected = false;

			var tmp_counter = 0;

		// --------------------------------------------------

		for(var c=0; c<dbconfigs.length; c++){
			if (
				typeof dbconfigs[c].dburl != "string"
				|| typeof dbconfigs[c].dbname != "string"
				|| typeof dbconfigs[c].dbsrc != "string"
			){
				continue;
			}
			(function(){
				// this.dburl = db_urls[c];
				var dbconfig = dbconfigs[c];
				self.checkConnection({
					"dburl" : dbconfig.dburl,
					"dbsrc" : dbconfig.dbsrc,
					"dbname" : dbconfig.dbname,
					"callback": function(res){

						tmp_counter++;

						if ( selected ) return;

						if ( res ){
							selected = true;

							self.dburl = dbconfig.dburl;
							self.dbsrc = dbconfig.dbsrc;
							self.dbname = dbconfig.dbname;
							self.dblogdir = dbconfig.dblogdir;

							// console.log("Соединение с БД установлено");

							self.emit("autoConfigSuccess");

							callback(true);

							return;
						}

						if ( tmp_counter == dbconfigs.length && !selected){
							self.emit("autoConfigFail");
							// console.log("Не удалось подключиться к базе данных");
							// process.exit(0);
							callback(false);
						}

					}
				});
			})();
		}
	};

	module.exports = DBAwwS;