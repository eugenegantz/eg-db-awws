"use strict";

var awwsUtils = require("./db-awws-utils.js");


var DBAwwsErrors = function() {
	Array.apply(this, arguments);
};


Object.getOwnPropertyNames(Array.prototype).forEach(function(key) {
	DBAwwsErrors.prototype[key] = Array.prototype[key];
});


DBAwwsErrors.prototype.toString = function() {
	var err, c, str = "";

	for (c = 0; c < this.length; c++) {
		err = this[c];

		if (err)
			str += awwsUtils.trim(err + "", " ;") + "(" + err.index + "); ";
	}

	return str;
};


module.exports = DBAwwsErrors;