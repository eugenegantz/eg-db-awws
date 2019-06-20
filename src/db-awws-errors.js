"use strict";

var awwsUtils = require("./db-awws-utils.js");


var DBAwwsErrors = function() {
	Array.apply(this, arguments);
};


Object.getOwnPropertyNames(Array.prototype).forEach(function(key) {
	DBAwwsErrors.prototype = Array.prototype[key];
});


DBAwwsErrors.prototype.toString = function() {
	var str = "";

	for (var c = 0; c < this.length; c++)
		str += awwsUtils.trim(this[c] + "", " ;") + "(" + c + "); ";

	return str;
};


module.exports = DBAwwsErrors;