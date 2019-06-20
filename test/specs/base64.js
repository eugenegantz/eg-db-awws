"use strict";

var assert                  = require("assert"),
	modBase64               = require("./../../src/db-awws-base64.js");

describe("awws.base64", () => {
	var b64,
		str = 'альфа, beta, 123456';

	before(() => {
		b64 = modBase64;
	});

	it(".encode(str) == str", () => {
		assert.equal(b64.encode(str), "u0LDQu9GM0YTQsCwgYmV0YSwgMTIzNDU2");
	});
});