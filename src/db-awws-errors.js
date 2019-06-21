"use strict";

var awwsUtils = require("./db-awws-utils.js");


var DBAwwsErrors = function() {
	Array.apply(this, arguments);
};


Object.getOwnPropertyNames(Array.prototype).forEach(function(key) {
	DBAwwsErrors.prototype[key] = Array.prototype[key];
});


DBAwwsErrors.prototype.toString = function() {
	var c, str = "";

	for (c = 0; c < this.length; c++) {
		if (this[c])
			str += awwsUtils.trim(this[c] + "", " ;") + "(" + c + "); ";
	}

	return str;
};


module.exports = DBAwwsErrors;