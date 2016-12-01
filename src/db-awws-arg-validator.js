"use strict";

var Va, _u = require("./db-awws-utils.js"),

	crHash = a => Object.create(null),

	WRONG_TYPE_ERR_MSG = "WRONG TYPE";

var ErrCollection = function(arr) {
	this.err = arr;
};

ErrCollection.prototype["throw"] = function() {
	for (let c = 0; c < this.err.length; c++) {
		if (!this.err[c]) continue;
		if (this.err[c].err)
			throw new Error(`${this.err[c].err}. Expected: ${this.err[c].expected}. Given: ${this.err[c].given}`);
	}

	return this;
};

var VaResult = function(arg) {
	Object.assign(this, arg);
};

module.exports = Va = {

	ErrCollection: ErrCollection,

	getType: function(value) {
		if (  Object.prototype.toString.call(value) == "[object Array]"  ){
			return "array";

		} else if (  Object.prototype.toString.call(value) == "[object Object]"  )  {
			return "object";

		} else if (  value === null  ) {
			return "null";

		} else if (  Object.prototype.toString.call(value) == "[object Date]"  ) {
			return "date";

		} else {
			return typeof value;
		}
	},

	filters: {
		array: {
			rmEmpty: function(arr) {
				// TODO
			}
		},

		object: {
			// TODO
		},

		number: {
			// TODO
		},

		string: {
			trim: _u.trim,

			ltrim: function(str, ch) {
				return _u.trim(str, ch, "L");
			},

			rtrim: function(str, ch) {
				return _u.trim(str, ch, "R");
			}
		},

		date: {
			// TODO
		}
	},

	rules: {
		"function": {
			type: function(fn) {
				var ret = crHash();

				ret.given = Va.getType(fn);
				ret.expected = "function";
				ret.err = ret.given != ret.expected && WRONG_TYPE_ERR_MSG;

				return new VaResult(ret);
			}
		},

		string: {
			type: function(str) {
				var ret = crHash();

				ret.given = Va.getType(str);
				ret.expected = "string";
				ret.err = ret.given != ret.expected && WRONG_TYPE_ERR_MSG;

				return new VaResult(ret);
			},

			minLen: function(str, len) {
				var ret = crHash();

				ret.expected = len;
				ret.given = str.length;
				ret.err = ret.given < len && "STRING LENGTH SHORTEST THAN EXPECTED";

				return new VaResult(ret);
			},

			maxLen: function(str) {
				// TODO
			},

			len: function(str) {
				// TODO
			}
		},

		array: {
			"type": function(arr) {
				var ret = crHash();

				ret.given = Va.getType(arr);
				ret.expected = "array";
				ret.err = ret.given != ret.expected && WRONG_TYPE_ERR_MSG;

				return new VaResult(ret);
			},

			minLen: function(arr, len) {
				var ret = crHash();

				ret.expected = len;
				ret.given = arr.length;
				ret.err = ret.given < len && "ARRAY LENGTH LESS THAN EXPECTED";

				return new VaResult(ret);
			},

			maxLen: function(arr) {
				// TODO
			},

			len: function(arr) {
				// TODO
			}
		},

		object: {
			"type": function(obj) {
				var ret = crHash();

				ret.given = Va.getType(obj);
				ret.expected = "object";
				ret.err = ret.given != ret.expected && WRONG_TYPE_ERR_MSG;

				return new VaResult(ret);
			},

			minLen: function(str) {
				// TODO
			},

			maxLen: function(str) {
				// TODO
			},

			len: function(str) {
				// TODO
			}
		},

		number: {
			min: function() {
				// TODO
			},

			max: function() {
				// TODO
			}
		},

		date: {

		}
	},

	validateResults: function(...rules) {
		return new this.ErrCollection(rules.filter(a => !!a));
	},

	validateValue: function(input, ...rules) {
		rules.forEach((a, c, arr) => {
			if (this.getType(a) == "function")
				arr[c] = a.call(this, input);
		});

		return this.validateResults(rules);
	}
};

Va.vav = Va.validateValue;

Va.var = Va.validateResults;

Va.r = Va.rules;

Va.r.str = Va.r.string;

Va.r.arr = Va.r.array;

Va.r.obj = Va.r.object;

Va.r.fn = Va.r.function;

Va.r.num = Va.r.number;