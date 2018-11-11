"use strict";

var awwsBase64  = require("./db-awws-base64.js"),
	_const = require("./db-awws-const.js");

module.exports = {

	/**
	 * Привести к строке
	 *
	 * @param {String | Object} dbCache
	 *
	 * @return {String}
	 * */
	"dbCacheToString": function(dbCache) {
		if (![].concat(dbCache).join(""))
			dbCache = "";

		if (typeof dbCache == "object") {
			var dbCachePrefix = "";

			_const.DB_CACHE_PREFIXES.forEach(function(prefix) {
				if (dbCache[prefix])
					dbCachePrefix += prefix;

				delete dbCache[prefix];
			});

			return dbCachePrefix + JSON.stringify(dbCache);
		}

		return dbCache + "";
	},


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
	},


	/**
	 * Собрать поля для запроса в формате AwwS (JSON без кавычек)
	 *
	 * @param {Object} fields - поля
	 * @param {Object=} opt
	 * @param {String=} opt.dbmethod
	 *
	 * @return {String}
	 * */
	"encodeFields": function(fields, opt) {
		opt = opt || {};

		var s = Object.keys(fields).map(function(k) {
			return k + ":\"" + fields[k] + "\"";
		});

		s = "{" + s.join(",") + "}";

		if ("GET" == opt.dbmethod)
			s = awwsBase64.encode(s);

		return s;
	},


	/**
	 * Собрать текст запроса на авторизацию
	 *
	 * @param {Object} arg
	 * @param {String} arg.dbname
	 * @param {String} arg.login
	 * @param {String} arg.login2
	 * @param {String} arg.loginhash
	 * @param {String} arg.tm
	 * @param {String} arg.loginorigin
	 *
	 * @return {String}
	 * */
	"encodeLogin": function(arg) {
		// example:
		// { Src:'main', Sql:'Auth', Alias:'Auth', Conf:'well', Login:'Eg', Login2:'Eg', Sha1:'c5d9...', Tm:'03:33', Origin:'http://fabula.net.ru'}

		var fields = {
			"Src": "main",
			"Sql": "Auth",
			"Alias": "Auth",
			"Conf": arg.dbname,
			"Login": arg.login,
			"Login2": arg.login2,
			"Sha1": arg.loginhash,
			"Tm": arg.tm,
			"Origin" : arg.loginorigin
		};

		return this.encodeFields(fields);
	},


	/**
	 * Формирует запрос в формате AwwS (JSON без кавычек)
	 *
	 * @param {Object} arg
	 * @param {String} arg.dbmethod - метод запроса POST|GET
	 * @param {String} arg.dbname
	 * @param {String} arg.dbsrc
	 * @param {String} arg.cache - название кэша (прим.*_ps123)
	 * @param {String} arg.query - текст запроса
	 *
	 * @return {String}
	 * */
	"encodeQuery": function(arg) {
		// example:
		// {Conf:"well", Src:"*main", Cache:"xU3lz", Sql:"UU0...", IDS:"594...", User:"127", Rights:"", Login:""}

		var fields = {
			"id": 0,
			"Conf": arg.dbname,
			"Src": arg.dbsrc,
			"Login": "",
			"Pwd": "",
			"Cache": awwsBase64.encode(arg.dbcache || ""),
			"Sql": awwsBase64.encode(arg.query),
			"IDS": arg.token.IDS || "",
			"User": arg.token.User || ""
		};

		var dbmethod = arg.dbmethod.toUpperCase();

		return this.encodeFields(fields, { dbmethod: dbmethod });
	}

};