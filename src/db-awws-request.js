"use strict";

var EventEmitter    = require("events"),
	DBAwwsErrors    = require('./db-awws-errors.js'),
	modUtil         = require("util"),
	Ajax            = require("eg-node-ajax"),
	awwsUtils       = require("./db-awws-utils.js"),
	_consts = {};


[
	["STATE_UNSENT", 0],
	["STATE_SENT", 1],
	["STATE_WAITING_RESPONSE", 2],
	["STATE_DONE", 3]
].forEach(function(a) {
	_consts[a[0]] = {
		configurable: false,
		enumerable: false,
		value: a[1],
		writable: false
	};
});


var sanitizeResponseText = (function() {
	var controlCharsMap = {};

	var controlCharCodes = [
		0, 1, 2, 3, 4, 5, 6, 7, 9,
		11, 17, 18, 19, 20, 21, 22, 23,
		24, 25, 26, 27, 28, 29, 30, 31
	];

	controlCharCodes.forEach(function(code) {
		controlCharsMap[String.fromCharCode(code)] = "";
	});

	// По мнению фабулы SOH - перевод строки
	controlCharsMap[String.fromCharCode(1)] = "\\n";
	controlCharsMap[String.fromCharCode(2)] = "\\r";

	return function sanitizeResponseText(str) {
		var c, s;
		var _str = "";

		for (c = 0; c < str.length; c++) {
			s = str[c];

			_str += s in controlCharsMap
				? controlCharsMap[s]
				: s;
		}

		return _str;
	}
})();


/**
 * @constructor
 * @param {Object} arg - параметры запроса
 * */
var DBAwwsReq = function(arg) {
	EventEmitter.call(this);

	this.state = this.STATE_UNSENT;

	this.setParams(arg);

	this.on("complete", function() {
		this.onComplete && this.onComplete.apply(this, arguments);
	});

	this.on("success", function() {
		this.onSuccess && this.onSuccess.apply(this, arguments);
	});

	this.on("error", function() {
		this.onError && this.onError.apply(this, arguments);
	});
};

modUtil.inherits(DBAwwsReq, EventEmitter);


Object.defineProperties(DBAwwsReq.prototype, _consts);


/**
 * Назначить параметры запроса
 * @param {Object} params - хэш с параметрами
 * @return {DBAwwsReq}
 * */
DBAwwsReq.prototype.setParams = function(params) {
	Object.assign(this, params);

	this.encodedData = awwsUtils.encodeQuery(this);

	return this;
};


/**
 * Отправить запрос
 * @param {Object=} arg
 * @param {Function=} arg.onComplete - callback, который возвращается всегда.
 * @param {Function=} arg.onSuccess - callback на случай успешного ответа
 * @param {Function=} arg.onError - callback на случай ответа с ошибками
 * @return {DBAwwsReq}
 * */
DBAwwsReq.prototype.send = function(arg) {
	this.errors         = [];
	this.httpError      = "";
	this.dbError        = "";
	this.error          = "";
	this.responseData   = void 0;

	if (typeof arg == "object") {
		arg.onComplete && (this.onComplete = arg.onComplete);
		arg.onSuccess && (this.onSuccess = arg.onSuccess);
		arg.onError && (this.onError = arg.onError);
	}

	Ajax.request({
		"method":       this.dbmethod,
		"url":          this.dburl,
		"data":         this.encodedData,
		"decodeFrom":   "windows-1251",
		"callback":     this._onAjaxAResponse.bind(this)
	});

	this.state = this.STATE_WAITING_RESPONSE;

	return this;
};


DBAwwsReq.prototype._onAjaxAResponse = function(httpErr, httpRes) {
	var error,
	    errors = new DBAwwsErrors();

	var dbres = {
		"err":  "",
		"recs": 0,
		"res":  [],
		"fld":  []
	};

	// Ошибка Ajax
	if (httpRes.error) {
		this.httpError = httpRes.error || null;

		this.emit("complete", this.httpError, this, { "err": this.httpError });

		this.emit("error", this.httpError, this);

		return this.state = this.STATE_DONE;
	}

	// Сервер прислал пустой ответ
	if (!httpRes.responseText) {
		this.httpError = "HTTP_RESPONSE_IS_EMPTY";

		this.emit("complete", this.httpError, this, { "err": this.httpError });

		this.emit("error", this.httpError, this);

		return this.state = this.STATE_DONE;
	}

	try {

		// Содержимое ответа из БД
		dbres = JSON.parse(
			sanitizeResponseText(httpRes.responseText)
		);

	} catch (err) {

		// Иногда фабула возвращает ответ вида:
		// `{ ..., "err":"\\'SSMA_CC$PROPERTY$Value$disallow_zero_length\\'", ...}`
		// и тогда JSON.parse возвращает исключение.
		// Видимо, проблема в двойном экранировании одинарной кавычки `"\\'"`.
		// После первой неудачной попытки попробовать распарсить текст с исключенным двойным экранированием.

		try {

			dbres = JSON.parse(
				sanitizeResponseText(
					httpRes.responseText.replace(/\\/ig, "")
				)
			);

		} catch (err) {

			if (typeof err.stack == "string") {
				dbres.err = httpRes.responseText + '\n-----\n' + err.stack;
				console.error(httpRes, err.stack);
			}

		}

	}

	// Вернулся массив?
	// На случай пакетного запроса
	if (!Array.isArray(dbres)) {
		if (dbres.err) {
			error           = new Error(dbres.err);
			error.index     = 0;
			error.query     = this.queries && this.queries[0];

			errors.push(error);
		}

	} else {
		for (var c = 0; c < dbres.length; c++) {
			if (dbres[c].err) {
				error           = new Error(dbres[c].err);
				error.index     = c;
				error.query     = this.queries && this.queries[c];

				errors.push(error);
			}
		}
	}

	// self - экземпляр DBRequest
	this.dbError = !errors.length ? null : errors;

	// !this.dbError && (this.responseData = dbres);
	this.responseData = dbres;

	// Выполнять в случае ошибки
	this.dbError && this.emit("error", this.dbError + '', this);

	// Выполнять в случае удачного ответа
	!this.dbError && this.emit("success", this, dbres);

	// Выполнять всегда
	this.emit("complete", this.dbError + '', this, dbres);

	this.state = this.STATE_DONE;
};

module.exports = DBAwwsReq;