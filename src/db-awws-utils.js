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
	 * Формирует запрос в формате AwwS (JSON без кавычек)
	 * @param {Object} arg
	 * @param {String} arg.dbmethod - метод запроса POST|GET
	 * @param {String} arg.dbname
	 * @param {String} arg.dbsrc
	 * @param {String} arg.cache - название кэша (прим.*_ps123)
	 * @param {String} arg.query - текст запроса
	 * */
	"encodeQuery": function(arg) {
		var dbmethod = arg.dbmethod.toUpperCase(),
				s = [
					"id:0",
					"Conf:\"" + arg.dbname + "\"",
					"Src:\"" + arg.dbsrc + "\"",
					"Login:\"\"",
					"Pwd:\"\"",
					"Cache:\"" + awwsBase64.encode(arg.dbcache || "") + "\"",
					"Sql:\"" + awwsBase64.encode(arg.query) + "\""
				];

		s = "{" + s.join(",") + "}";

		if (dbmethod == "POST")
			return s;

		if (dbmethod == "GET")
			return awwsBase64.encode(s);
	}

};