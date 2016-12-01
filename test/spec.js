"use strict";

var assert      = require("assert"),
	modSinon    = require("sinon"),
	modUtil     = require("util"),
	modDBAwws   = require("./../src/db-awws.js"),
	modDBReq    = require("./../src/db-awws-request.js"),
	Va          = require("./../src/db-awws-arg-validator.js"),
	utils       = require("./../src/db-awws-utils.js"),
	modBase64   = require("./../src/db-awws-base64.js"),
	connectionOptions = {
		"dburl": "http://127.0.0.1:9000/db?",
		"dbname": "well.demo",
		"dbsrc": "main"
	};

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

			var encoded = u.encodeQuery(arg);

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
});

describe("validator", () => {
	describe("string", () => {
		describe("type", () => {
			it("'abc' is string == true", () => {
				assert.ok(!Va.rules.string.type("abc").err);
			});

			it("{} is string == false", () => {
				assert.ok(Va.rules.string.type({}).err);
			});
		});

		describe("minLen", () => {
			it("'abc' minLen 2 == true", () => {
				assert.ok(!Va.rules.string.minLen("abc", 2).err);
			});

			it("'abc' minLen 3 == true", () => {
				assert.ok(!Va.rules.string.minLen("abc", 2).err);
			});

			it("'abc' minLen 4 == false", () => {
				assert.ok(Va.rules.string.minLen("abc", 4).err);
			});
		});
	});

	describe("array", () => {
		describe("type", () => {
			it("[1, 2, 3] is Array == true", () => {
				assert.ok(!Va.rules.array.type([]).err);
			});

			it("{} is Array == false", () => {
				assert.ok(Va.rules.array.type({}).err);
			});
		});

		describe("minLen", () => {
			it("[1, 2] minLen 2 == true", () => {
				assert.ok(!Va.rules.array.minLen([1, 2], 2).err);
			});

			it("[1] minLen 2 == false", () => {
				assert.ok(Va.rules.array.minLen([1], 2).err);
			});

			it("[] minLen 0 == true", () => {
				assert.ok(!Va.rules.array.minLen([], 0).err);
			});
		});
	});

	describe("object", () => {
		describe("type", () => {
			it("{a: 1} is Object == true", () => {
				assert.ok(!Va.rules.object.type({a: 1}).err);
			});

			it("[] is Object == false", () => {
				assert.ok(Va.rules.object.type([]).err);
			});
		});
	});

	describe("function", () => {
		describe("type", () => {
			it("function() {} is Function == true", () => {
				assert.ok(!Va.rules.function.type(function() {}).err);
			});

			it("void 0 is Function == false", () => {
				assert.ok(Va.rules.function.type(void 0).err);
			});
		});
	});

	describe(".validate()", () => {
		describe("string", () => {
			it(".var(type('abc'), minLen('abc', 2)).err.length == 2", () => {
				assert.equal(
					Va.var(
						Va.r.str.type("abc"),
						Va.r.str.minLen("abc", 2)
					).err.length,
					2
				);
			});

			it(".var(type('abc'), minLen('abc', 2)).throw() => ok", () => {
				assert.ok(
					Va.var(
						Va.r.str.type("abc"),
						Va.r.str.minLen("abc", 2)
					).throw()
				);
			});

			it(".var(type('abc'), minLen('1', 2)).throw() => thrown exception", () => {
				var hasErr;

				try {
					Va.var(
						Va.r.str.type("abc"),
						Va.r.str.minLen("1", 2)
					).throw()
				} catch (e) {
					hasErr = !!e;
				}

				assert.ok(hasErr);
			});
		});

		describe("object", () => {
			it(".var(type({})).err.length == 1", () => {
				assert.equal(
					Va.var(Va.r.obj.type({ a: 1 })).err.length,
					1
				);
			});

			it(".var(type({})).throw() => ok", () => {
				assert.ok(Va.var(Va.r.obj.type({ a: 1 })).throw());
			});

			it(".var(type([1, 2, 3])).throw() => thrown exception", () => {
				var hasErr;

				try {
					Va.var(Va.r.obj.type([1, 2, 3])).throw()
				} catch (e) {
					hasErr = !!e;
				}

				assert.ok(hasErr);
			});
		});
	});
});

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
					"callback": function(err, ctx, dbres_) {
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
			var dbres, err, ctx;

			before((done) => {
				db.dbquery({
					"query": "SELECT abc",
					"callback": function(err_, ctx_, dbres_) {
						dbres = dbres_;
						err = err_;
						ctx = ctx_;
						done();
					}
				});
			});

			it("ctx === db", () => {
				assert.equal(ctx, db);
			});

			it("err - это строка", () => {
				assert.equal(typeof err, "string");
			});

			it("dbres.err - это строка", () => {
				assert.equal(typeof dbres.err, "string");
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

		describe("Неправильные аргументы методы", function() {
			it(`arg.query = "" => thrown Exception`, (done) => {
				try {
					db.dbquery({ "query": "" });
				} catch (e) {
					done();
				}
			});

			it(`arg.query_b = "" => thrown Exception`, (done) => {
				try {
					db.dbquery({ "query": "123456", "query_b": "" });
				} catch (e) {
					done();
				}
			});

			it(`arg = {} => thrown Exception`, (done) => {
				try {
					db.dbquery({});
				} catch (e) {
					done();
				}
			});

			it(`arg = void 0 => thrown Exception`, (done) => {
				try {
					db.dbquery();
				} catch (e) {
					done();
				}
			});
		});

		describe("Пакетный запрос", () => {
			var dbres, ctx, err;

			before((done) => {
				db.dbquery({
					"query": "SELECT NOW(); SELECT 1 + 1 AS two; SELECT 2 + 3 AS five",
					"callback": function(err_, ctx_, dbres_) {
						dbres = dbres_;
						err = err_;
						ctx = ctx_;
						done();
					}
				});
			});

			it("err is falsy", () => {
				assert.ok(!err);
			});

			it("ctx === db", () => {
				assert.equal(db, ctx);
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
				var dbres, err, ctx;

				before(done => {
					db.getDBData({
						query: "SELECT NOW();",
						format: "awws",
						callback: (err_, ctx_, dbres_) => {
							dbres = dbres_;
							err = err_;
							ctx = ctx_;
							done();
						}
					});
				});

				it("Ответ содержит поля: fld, res, err", () => {
					assert.ok("fld" in dbres);
					assert.ok("res" in dbres);
					assert.ok("err" in dbres);
				});

				it("err === null", () => {
					assert.equal(err, null);
				});

				it("ctx === экземпляр БД", () => {
					assert.equal(ctx, db);
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
				// TODO
				assert.ok(false, "TODO");
			});
		});

		describe.skip("Пакетный запрос", () => {
			var dbres;

			before((done) => {
				db.dbquery({
					"query": "SELECT NOW(); SELECT 1 + 1 AS two; SELECT 2 + 3 AS five",
					"callback": function(err, ctx, dbres_) {
						dbres = dbres_;
						done();
					}
				});
			});

			it("TODO", () => {
				// TODO
				assert.ok(false, "TODO");
			});
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
				// TODO
				assert.ok(false, "TODO");
			});
		});
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

	describe("Контрольный запрос", () => {
		var db, err, ctx, dbres, dbReq, stackTrace;

		before(function(done) {
			this.timeout(5000);

			db = modDBAwws
					.prototype
					.getInstance(connectionOptions);

			var resTpl = Object.assign(db._createResTpl(), { "debug": 1 });
			db._createResTpl = function() {
				return Object.assign({}, resTpl);
			};

			db.dburl = "http://127.0.0.1:999/fail";

			db.on("requestFail", function() {
				Object.keys(this._reqStorage).forEach((a) => {
					this._reqStorage[a].forEach((b) => {
						dbReq = b;
					});
				});

				this.dburl = connectionOptions.dburl;
				dbReq.dburl = this.dburl;
			});

			db.dbquery({
				"query": "SELECT 1+1",
				"query_b": "SELECT 2+2",
				"callback": function(err_, ctx_, dbres_) {
					err = err_;
					ctx = ctx_;
					dbres = dbres_;
					stackTrace = new Error().stack;
					done();
				}
			});
		});

		after(() => {
			db.dburl = connectionOptions.dburl;
		});

		it(`"at DBAwwS._sendBCallback" в stackTrace - признак ответа через контроль ошибок`, () => {
			assert.ok(!!stackTrace.match(/(DBAwwS._sendBCallback)/ig));
		});

		it(`"dbres.debug = 1" - признак ответа пустым шаблоном`, () => {
			assert.ok(dbres.debug);
		});
	});

	describe.skip("Автонастройка при обрыве соединения", () => {
		it("TODO", () => {
			// TODO
			assert.ok(false)
		});
	});

	describe("rapidCache", () => {
		var db;

		var resetRapidCache = function() {
			if (!db) return;

			db._reqStorage = {};
			db.rapidCache.onHttpResponseEmpty = false;
			db.rapidCache.onRace = false;
			db.rapidCache.onHasCache = false;
			db.rapidCache.timeout = 2000;
		};

		before(() => {
			db = modDBAwws
					.prototype
					.getInstance(connectionOptions);
		});

		afterEach(() => {
			resetRapidCache();
		});


		describe("Быстрый ответ при наличии горячего кэша (onHasCache = true)", () => {
			var dbres, sql = "SELECT 1+1 AS two";

			before((done) => {
				db.dbquery({
					"query": sql,
					"callback": (err_, ctx_, dbres_) => {
						dbres = dbres_;
						done();
					}
				});
			});

			beforeEach(() => {
				db.rapidCache.onHasCache = true;
			});

			it("Ответ на второй запрос возвращает тот же экземпляр объекта, что и на первый", (done) => {
				db.dbquery({
					"query": sql,
					"callback": (err_, ctx_, dbres_) => {
						if (dbres != dbres_)
							throw new Error("Разные экземпляры объектов - возвращен не кэш");

						done();
					}
				});
			});
		});

		describe("Ответ на опережение (onRace = true)", () => {
			var args1, args2, finalCacheLen,
				sql = "SELECT 1+1 AS two";

			before(function(done) {
				this.timeout(5000);

				resetRapidCache();
				db.rapidCache.onRace = true;

				var v = 0,
					d = () => { ++v == 2 && done(); };

				// Первый. Поломанный запрос - имитация задержки внутри .dbquery()
				db.dbquery({
					"query": sql,
					"dburl": "http://127.0.0.1:999/fail",
					"callback": function(...args) {
						args1 = args;
						d();
					}
				});

				setTimeout(() => {
					// Второй рабочий запрос
					db.dbquery({
						"query": sql,
						"callback": function(...args) {
							args2 = args;
							finalCacheLen = Object.keys(db._reqStorage).length;
							d();
						}
					})
				}, 100);
			});

			it("Выполниться без ошибок должны оба запроса", () => {
				assert.ok(!args1[0]);
				assert.ok(!args2[0]);
			});

			it("Оба запроса имеют один и тот же экземпляр объекта-ответа", () => {
				assert.ok(args1[2] === args2[2]);
			});

			it("Длина кэша - один запрос", () => {
				assert.equal(finalCacheLen, 1);
			});
		});

		describe("Если пустой ответ от сервера (onHttpResponseEmpty = true)", () => {
			var c, err, maxCacheLen,
				responses = new Set(),
				repeats = 25,
				sql = "SELECT 1+1 AS two";

			before(function(done) {
				this.timeout(5000);

				var dc = 0,
					d = () => { ++dc == 5 && done(); };

				resetRapidCache();
				db.rapidCache.onHttpResponseEmpty = true;

				// Первый запрос, кешируется
				for (c = 0; c < repeats; c++) {
					db.dbquery({
						"query": sql,
						"callback": function(...args_) {
							if (args_[0]) err = args_[0];
							responses.add(args_[2]);

							Object.keys(db._reqStorage).forEach((a) => {
								maxCacheLen = db._reqStorage[a].size;
							});

							d();
						}
					});
				}
			});

			it("Выполниться без ошибок должны все запросы. repeats == " + repeats, () => {
				assert.ok(!err);
			});

			it("Некоторые запросы имеют один и тот же экземпляр объекта-ответа. new Set(responses).size != repeats", () => {
				assert.notEqual(responses.size, repeats);
			});

			it("Длина кэша == " + repeats, () => {
				assert.equal(maxCacheLen, repeats);
			});
		});

		describe("._getRapidCacheFineReq()", () => {
			// TODO
		});

		describe("Проверка кеширования", () => {
			var sql = "SELECT 1+1 AS two";

			it("После двух запросов, где один возвращает кэш, остается только один закешированный объект", (done) => {
				db.rapidCache.onHasCache = true;
				db._reqStorage = {};

				db.dbquery({
					"query": sql,
					"callback": () => {
						db.dbquery({
							"query": sql,
							"callback": a => {
								if ((a = Object.keys(db._reqStorage).length) != 1)
									throw new Error("Количество кешированных запросов не равно одному. А именно: " + a);

								done();
							}
						});
					}
				});
			});
		});

		describe("rapidCache работает только для SELECT", () => {
			var _reqCacheLenBefore;

			before(() => {
				_reqCacheLenBefore = Object.keys(db._reqStorage).length;
			});

			it("Длина хранилища с кешированными запросами не изменилась", (done) => {
				db.dbquery({
					"query": "UPDATE TableUpd SET a = 100 WHERE b = 200",
					"callback": () => {
						if (_reqCacheLenBefore != Object.keys(db._reqStorage).length)
							throw new Error("Длина хранилища с кеш. запросами изменилась");

						done();
					}
				});
			});

		})
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
			// TODO
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
				callback: () => {}
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
				callback: () => {}
			});
		});
	});
});