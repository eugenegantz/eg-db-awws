"use strict";

const
	assert                  = require("assert"),
	modDBReq                = require("./../../src/db-awws-request.js");


describe("db-awws-request", () => {
	describe("constructor", () => {
		var req;

		before(() => {
			var arg = {
				"dbmethod": "GET",
				"dbname": "dbname",
				"dbsrc": "dbsrc",
				"dbcache": "",
				"query": "SELECT NOW();"
			};

			req = new modDBReq(arg)
		});

		it("req.encodedData", () => {
			assert.equal(typeof req.encodedData, "string");
		});
	});

	describe.skip(".setParams()", () => {
		var prevEncodedData;

		it("TODO", () => {
			assert.ok(false);
			// TODO
		});
	});

	describe.skip(".send()", () => {
		it("TODO", () => {
			assert.ok(false);
			// TODO
		});
	});

	describe.skip(".onError", () => {
		it("TODO", () => {
			assert.ok(false);
			// TODO ответ, this.httpError, this.dbError, обнуление свойств при запросе
		});
	});

	describe.skip(".onSuccess", () => {
		it("TODO", () => {
			assert.ok(false);
			// TODO ответ, this.httpError, this.dbError, обнуление свойств при запросе
		});
	});

	describe.skip(".onComplete", () => {
		it("TODO", () => {
			assert.ok(false);
			// TODO ответ, this.httpError, this.dbError, обнуление свойств при запросе
		});
	});
});