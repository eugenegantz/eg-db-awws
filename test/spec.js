"use strict";

var assert = require("assert"),
	modUtil = require("util"),
	modDBAwws = require("./../src/dbawws.js"),
	connectionOptions = {
		"dburl": "http://127.0.0.1:9000/db?",
		"dbname": "well.demo",
		"dbsrc": "main"
	};

describe("eg-db-awws", () => {
	describe("Конструктор", () => {
		var db;

		before(() => {
			db = modDBAwws
				.prototype
				.getInstance(connectionOptions);
		});

		it("После инициализации содержит свойства подключения", () => {
			assert.ok(db.dbname, "dbname");
			assert.ok(db.dbsrc, "dbsrc");
			assert.ok(db.dburl, "dburl");
		});
	});

	describe(".dbquery({})", () => {
		var db;

		before(() => {
			db = modDBAwws
				.prototype
				.getInstance(connectionOptions);
		});

		describe("Один запрос. SELECT NOW()", () => {
			var dbres;

			before((done) => {
				db.dbquery({
					"query": "SELECT NOW();",
					"callback": function(dbres_) {
						dbres = dbres_;
						done();
					}
				});
			});

			it("dbres должен быть объектом", () => {
				assert.ok(modUtil.isObject(dbres))
			});

			it("dbres.res.length == 1", () => {
				assert.equal(dbres.res.length, 1);
			})
		});

		describe("Пакетный запрос", () => {
			var dbres;

			before((done) => {
				db.dbquery({
					"query": "SELECT NOW(); SELECT 1 + 1 AS two; SELECT 2 + 3 AS five",
					"callback": function(dbres_) {
						dbres = dbres_;
						done();
					}
				});
			});

			it("dbres должен быть массивом", () => {
				assert.ok(modUtil.isArray(dbres));
			});

			it("dbres.length == 3", () => {
				assert.equal(dbres.length, 3);
			});

			it("Каждый ответ в пакете имеет поле err, recs, res", () => {
				dbres.forEach((res) => {
					assert.ok("fld" in res);
					assert.ok("res" in res);
					assert.ok("err" in res);
				});
			});

			it("Каждый ответ в одну строку", () => {
				dbres.forEach((res) => {
					assert.ok(res.res.length == 1);
				});
			});
		});
	});

	describe.skip(".getDBData()", () => {
		var db;

		before(() => {
			db = modDBAwws
				.prototype
				.getInstance(connectionOptions);
		});

		describe("Один запрос. SELECT NOW()", () => {
			var dbres;

			before((done) => {
				db.getDBData({
					"query": "SELECT NOW();",
					"format": "row[col]",
					"callback": function(dbres_) {
						dbres = dbres_;
						done();
					}
				});
			});

			it("TODO", () => {
				assert.ok(false, "TODO");
			});
		});

		describe("Пакетный запрос", () => {
			var dbres;

			before((done) => {
				db.dbquery({
					"query": "SELECT NOW(); SELECT 1 + 1 AS two; SELECT 2 + 3 AS five",
					"callback": function(dbres_) {
						dbres = dbres_;
						done();
					}
				});
			});

			it("TODO", () => {
				assert.ok(false, "TODO");
			});
		});
	});

	describe("awws.base64", () => {
		var b64,
			str = 'альфа, beta, 123456';

		before(() => {
			b64 = modDBAwws.prototype.Base64;
		});

		it(".decode(.encode(str)) == str", () => {
			assert.equal(b64.encode(str), "u0LDQu9GM0YTQsCwgYmV0YSwgMTIzNDU2");
		});
	});

	describe.skip(".checkConnection()", () => {
		it("TODO", () => {
			assert.ok(false, "TODO");
		});
	});

	describe.skip(".autoConfig()", () => {
		it("TODO", () => {
			assert.ok(false, "TODO");
		});
	});

	describe.skip(".writeLog()", () => {
		it("TODO", () => {
			assert.ok(false, "TODO");
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
			var encoded = modDBAwws.prototype.encodeQuery(arg);

			assert.equal(
				"Oe2lkOjAsQ29uZjoiZGJuYW1lIix" +
				"TcmM6ImRic3JjIixMb2dpbjoiIix" +
				"Qd2Q6IiIsQ2FjaGU6IiIsU3FsOiJ" +
				"SVTBWTVJVTlVJRTVQVnlncE93PT0" +
				"ifQ==",
				encoded
			);
		});

		it("POST", () => {
			arg.dbmethod = "POST";

			var encoded = modDBAwws.prototype.encodeQuery(arg);

			assert.equal(
				'{' +
					'id:0,' +
					'Conf:"dbname",' +
					'Src:"dbsrc",' +
					'Login:"",' +
					'Pwd:"",' +
					'Cache:"",' +
					'Sql:"RU0VMRUNUIE5PVygpOw=="' +
				'}',
				encoded
			);
		})
	});

	describe(".splitSQL()", () => {
		describe("Один запрос", () => {
			var sql;

			before(() => {
				sql = "SELECT NOW();";
			});

			it("Возвращает массив", () => {
				assert.ok(Array.isArray(modDBAwws.prototype.splitSQL(sql)));
			});

			it("массив res.length == 1", () => {
				assert.equal(modDBAwws.prototype.splitSQL(sql).length, 1);
			});

			it("res[0] == 'SELECT NOW()'", () => {
				assert.equal(modDBAwws.prototype.splitSQL(sql), "SELECT NOW()");
			});
		});

		describe("Пакетный запрос", () => {
			var sql,
				sqlArr = [
					"SELECT NOW()",
					"SELECT 1 + 1 AS two",
					"SELECT 2 + 3 AS five"
				];

			before(() => {
				sql = sqlArr.join(";");
			});

			it("Возвращает массив", () => {
				assert.ok(Array.isArray(modDBAwws.prototype.splitSQL(sql)));
			});

			it("массив res.length == 1", () => {
				assert.equal(modDBAwws.prototype.splitSQL(sql).length, 3);
			});

			it("res[n] == '...'", () => {
				var res = modDBAwws.prototype.splitSQL(sql);

				sqlArr.forEach((a, c) => {
					assert.equal(res[c], sqlArr[c]);
				});
			});
		});
	});

	describe("._utils", () => {
		var u;

		before(() => {
			u = modDBAwws.prototype._utils;
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
	});
});