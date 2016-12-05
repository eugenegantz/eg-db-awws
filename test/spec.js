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
	beforeEach(() => {
		modDBAwws.prototype.instances.forEach((a) => {
			delete modDBAwws.prototype.instances[a];
		});
	});

	describe("Конструктор", () => {
		var db;

		before(() => {
			db = modDBAwws
				.prototype
				.getInstance(connectionOptions);
		});

		it("Constructor(arg), После инициализации содержит свойства подключения (arg)", () => {
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
			});
		});

		describe("Один запрос с ошибкой", () => {
			var dbres;

			before((done) => {
				db.dbquery({
					"query": "SELECT abc",
					"callback": function(dbres_) {
						dbres = dbres_;
						done();
					}
				});
			});

			it("dbres.err - это строка", () => {
				assert.ok(typeof dbres.err == "string");
			});

			it("dbres.err.length > 0", () => {
				assert.ok(dbres.err.length > 0);
			});

			it("dbres.recs == 0", () => {
				assert.equal(dbres.recs, 0);
			});

			it("dbres.res.length == 0", () => {
				assert.equal(dbres.res.length, 0);
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

	describe(".getDBData(arg)", () => {
		var db;

		before(() => {
			db = modDBAwws
				.prototype
				.getInstance(connectionOptions);
		});

		describe("SELECT ONLY", function() {
			it("UPDATE == false", done => {
				db.getDBData({
					"query": "UPDATE TesTable SET a = 1",
					"selectOnly": true,
					"callback": dbres => {
						if (dbres.info.errors != "Expected ONLY select queries")
							throw new Error(`wrong err message. "${dbres.info.errors}" given`);

						done();
					}
				});
			});

			it("SELECT == true", done => {
				db.getDBData({
					"query": "SELECT NOW()",
					"selectOnly": true,
					"callback": dbres => {
						if (!dbres)
							throw new Error("dbres is not empty");

						done();
					}
				});
			});
		});

		describe("arg.format", function() {
			describe("arg.format = 'awws'", () => {
				var dbres;

				before(done => {
					db.getDBData({
						query: "SELECT NOW();",
						format: "awws",
						callback: dbres_ => {
							dbres = dbres_;
							done();
						}
					});
				});

				it("Ответ содержит поля: fld, res, err", () => {
					assert.ok("fld" in dbres);
					assert.ok("res" in dbres);
					assert.ok("err" in dbres);
				});
			});

			describe("arg.format = 'row[col]'", () => {
				var dbres;

				before((done) => {
					db.getDBData({
						query: "SELECT NOW();",
						format: "row[col]",
						callback: (dbres_) => {
							dbres = dbres_;
							done();
						}
					});
				});

				it("Ответ (dbres) должен иметь поля recs, info = {t, t_fx, t_fabula, t_jsDecode, num_rows, errors}", () => {
					assert.ok("info" in dbres, "dbres.info");
					assert.ok("recs" in dbres, "dbres.recs");

					["t", "t_fx", "t_fabula", "t_jsDecode", "num_rows", "errors"].forEach((a) => {
						assert.ok(a in dbres.info, a);
					});
				});

				it("dbres.recs - это массив, длина == 1", () => {
					assert.ok(Array.isArray(dbres.recs));
					assert.equal(dbres.recs.length, 1);
				});

				it("dbres.info.errors - это строка, длина == 0", () => {
					assert.ok(typeof dbres.info.errors == "string");
					assert.ok(!dbres.info.errors);
				});

				describe("Случай с ошибкой", () => {
					var dbres;

					before((done) => {
						db.getDBData({
							query: "SELECT abc;",
							format: "row[col]",
							callback: (dbres_) => {
								dbres = dbres_;
								done();
							}
						});
					});

					it("dbres.recs - это массив, длина == 0", () => {
						assert.ok(Array.isArray(dbres.recs));
						assert.equal(dbres.recs.length, 0);
					});

					it("dbres.info.errors - это строка, длина > 0", () => {
						assert.ok(typeof dbres.info.errors == "string");
						assert.ok(dbres.info.errors.length > 0);
					});
				});
			});

			describe("arg.format = 'col[row]'", () => {
				var dbres;

				before((done) => {
					db.getDBData({
						query: "SELECT NOW() as _now, DATE() as _date;",
						format: "col[row]",
						callback: (dbres_) => {
							dbres = dbres_;
							done();
						}
					});
				});

				it("Ответ (dbres) должен иметь поля recs, info = {t, t_fx, t_fabula, t_jsDecode, num_rows, errors}", () => {
					assert.ok("info" in dbres, "dbres.info");
					assert.ok("recs" in dbres, "dbres.recs");

					["t", "t_fx", "t_fabula", "t_jsDecode", "num_rows", "errors"].forEach((a) => {
						assert.ok(a in dbres.info, a);
					});
				});

				it("dbres.recs - это объект с двумя массивами: _now, _date", () => {
					assert.ok(modUtil.isObject(dbres.recs));
					assert.equal(dbres.recs._now.length, 1);
					assert.equal(dbres.recs._date.length, 1);
				});

				it("dbres.info.errors - это строка, длина == 0", () => {
					assert.ok(typeof dbres.info.errors == "string");
					assert.ok(!dbres.info.errors);
				});

				describe("Случай с ошибкой", () => {
					var dbres;

					before((done) => {
						db.getDBData({
							query: "SELECT abc;",
							format: "col[row]",
							callback: (dbres_) => {
								dbres = dbres_;
								done();
							}
						});
					});

					it("dbres.recs - это объект, длина == 0", () => {
						assert.ok(modUtil.isObject(dbres.recs));
						assert.equal(Object.keys(dbres.recs), 0);
					});

					it("dbres.info.errors - это строка, длина > 0", () => {
						assert.ok(typeof dbres.info.errors == "string");
						assert.ok(dbres.info.errors.length > 0);
					});
				});
			});
		});

		describe.skip("Один запрос. SELECT NOW()", () => {
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

		describe.skip("Пакетный запрос", () => {
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

		it(".encode(str) == str", () => {
			assert.equal(b64.encode(str), "u0LDQu9GM0YTQsCwgYmV0YSwgMTIzNDU2");
		});
	});

	describe(".logs = []", () => {
		describe("Ведение лога внутри экземпляра класса", () => {
			var db, logLen;

			before(() => {
				db = modDBAwws
						.prototype
						.getInstance(connectionOptions);

				logLen = db.log.length
			});

			it("После запроса лог должен стать на один длиннее", done => {
				db.dbquery({
					query: "SELECT NOW();",
					callback: () => {
						setTimeout(() => {
							if (logLen + 1 != db.log.length)
								throw new Error("Длина лога не увеличилась");

							done();
						}, 100);
					}
				});
			});
		});

		describe.skip(".writeLog()", () => {
			it("TODO", () => {
				assert.ok(false, "TODO");
			});
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

			it("массив res.length == 3", () => {
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

	describe(".hasOnlySelectQuery()", () => {
		it("SELECT == TRUE", () => {
			var sql = "SELECT 1+1 AS col_sum";

			assert.ok(modDBAwws.prototype.hasOnlySelectQuery(sql));
		});

		it("DELETE == FALSE", () => {
			var sql = "DELETE FROM TableTest";

			assert.ok(!modDBAwws.prototype.hasOnlySelectQuery(sql));
		});

		it("SELECT; SELECT; UPDATE == FALSE", () => {
			var sql = "SELECT 1+1 AS col_sum;" +
					"SELECT 2+2 AS col_sum;" +
					"UPDATE TableTest SET col_a = 1";

			assert.ok(!modDBAwws.prototype.hasOnlySelectQuery(sql));
		});

		it("SELECT; SELECT; SELECT == TRUE", () => {
			var sql = "SELECT 1+1 AS col_sum;" +
					"SELECT 2+2 AS col_sum;" +
					"SELECT 3+3 AS col_sum;";

			assert.ok(modDBAwws.prototype.hasOnlySelectQuery(sql));
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

	describe.skip("rapidCache", () => {
		var db;

		before(() => {
			db = modDBAwws
					.prototype
					.getInstance(connectionOptions);
		});
	});

	describe.skip("Костыль: случай когда сервер возвращает пустой кэш", () => {

	});

	describe(".checkConnection()", () => {
		var db, propsBackup = {};

		before(() => {
			db = modDBAwws
					.prototype
					.getInstance(connectionOptions);

			propsBackup.dburl = db.dburl;
			propsBackup.dbsrc = db.dbsrc;
			propsBackup.dbname = db.dbname;
		});

		beforeEach(() => {
			Object.assign(db, propsBackup);
		});

		it("true", (done) => {
			var arg = Object.assign({}, connectionOptions);
			arg.callback = (isOk) => {
				if (!isOk)
					throw new Error("isOk == false");

				done();
			};

			db.checkConnection(arg);
		});

		it("false", (done) => {
			var arg = Object.assign({}, connectionOptions);
			arg.dburl = "http://127.0.0.1:999/fail" + Math.random();
			arg.callback = (isOk) => {
				if (isOk)
					throw new Error("isOk == false");

				done();
			};

			db.checkConnection(arg);
		});
	});

	describe.skip(".autoConfig()", () => {
		it("TODO", () => {
			assert.ok(false, "TODO");
		});
	});

	describe("events", () => {
		var db, propsBackup = {};

		before(() => {
			db = modDBAwws
					.prototype
					.getInstance(connectionOptions);

			propsBackup.dburl = db.dburl;
			propsBackup.dbsrc = db.dbsrc;
			propsBackup.dbname = db.dbname;
		});

		beforeEach(() => {
			Object.assign(db, propsBackup);
			db.removeAllListeners("requestFail");
			db.removeAllListeners("dbResponseError");
			db.removeAllListeners("writeLog");
			db.removeAllListeners("autoConfigSuccess");
			db.removeAllListeners("autoConfigFail");
		});

		it("fire: autoConfigSuccess", (done) => {
			db.on("autoConfigSuccess", () => {
				done();
			});

			db.autoConfig({
				dbconfigs: [connectionOptions]
			});
		});

		it("fire: autoConfigFail", (done) => {
			db.on("autoConfigFail", () => {
				done();
			});

			var arg = Object.assign({}, propsBackup);
			arg.dburl = "http://127.0.0.1:999/fail" + Math.random();

			db.autoConfig({
				dbconfigs: [arg]
			});
		});

		it("fire: dbResponseError", (done) => {
			db.on("dbResponseError", () => {
				done();
			});

			db.dbquery({
				query: "SELECT abc",
				callback: dbres => {}
			});
		});

		it("fire: requestFail", (done) => {
			var repeats = 0;

			db.dburl = "http://127.0.0.1:999/fail" + Math.random();

			db.on("requestFail", () => {
				db.reqFailRepeats == ++repeats && done();
			});

			db.dbquery({
				query: "SELECT NOW();",
				callback: dbres => {}
			});
		});
	});
});