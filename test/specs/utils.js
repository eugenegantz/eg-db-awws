"use strict";

const
	assert                  = require("assert"),
	utils                   = require("./../../src/db-awws-utils.js");

describe("._utils", () => {
	var u;

	before(() => {
		u = utils;
	});

	describe(".trim()", function() {
		it(".trim('12345', '1245') == '3'", () => {
			assert.equal(u.trim("12345", "1245"), "3");
		});

		it(".trim('12345', '12345') == '' ", () => {
			assert.equal(u.trim("12345", "12345"), "");
		});

		it(".trim('12345', '\\d') == '' ", () => {
			assert.equal(u.trim("12345", "\\d"), "");
		});

		it(".trim('12345', '1245', 'L') == '12345' ", () => {
			assert.equal(u.trim("12345", "1245", "L"), "345");
		});

		it(".trim('12345', '1245', 'R') == '123' ", () => {
			assert.equal(u.trim("12345", "1245", "R"), "123");
		});
	});

	describe(".encodeQuery", () => {
		var arg;

		beforeEach(() => {
			arg = {
				"dbmethod": "GET",
				"dbname": "dbname",
				"dbsrc": "dbsrc",
				"dbcache": "",
				"query": "SELECT NOW();"
			};
		});

		it("GET", () => {
			var encoded = u.encodeQuery(arg);

			assert.equal(encoded, "Oe2lkOiIwIixDb25mOiJkYm5hbWUiLFNyYzoiZGJzcmMiLExvZ2luOiIiLFB3ZDoiIixDYWNoZToiIixTcWw6IlJVMFZNUlVOVUlFNVBWeWdwT3c9PSIsSURTOiIiLFVzZXI6IiJ9");
		});

		it("POST", () => {
			arg.dbmethod = "POST";

			var encoded = u.encodeQuery(arg);

			assert.equal(''
				+ '{'
				+   'id:"0",'
				+   'Conf:"dbname",'
				+   'Src:"dbsrc",'
				+   'Login:"",'
				+   'Pwd:"",'
				+   'Cache:"",'
				+   'Sql:"RU0VMRUNUIE5PVygpOw==",'
				+   'IDS:"",'
				+   'User:""'
				+ '}',
				encoded
			);
		})
	});
});