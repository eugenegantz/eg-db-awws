"use strict";

const
	modBase64               = require("./../../src/db-awws-base64.js"),
	config                  = require("./../config/db-config-awws.ignore.js"),
	iconv                   = require('iconv-lite'),
	modDBAwws               = require("./../../src/db-awws.js"),
	connectionOptions       = config.dbconfigs[0];

const
	port = config.test.server.port,
	http = require('http');

let _testAttempts = {
	failover: {
		req: {},
	},
};

let db;

console.log('8000 start');

let server = new http.Server(function(req, res) {
	db = db || new modDBAwws(connectionOptions);

	db._debugIgnore = 1;
	db.rapidCache = false;

	let  reqStr = "";

	res.setHeader("Content-Type", "application/json");

	req.on("data", (data) => { // Пришла информация - записали.
		reqStr += data;
	});

	req.on("end", () => {// Информации больше нет - передаём её дальше.
		let obj         = eval(`(${reqStr})`),
		    testError   = obj.testError ? modBase64.decode(obj.testError) : null,
		    query       = modBase64.decode(obj.Sql);

		db.dbquery({
			query,
			callback(_err, self, dbRes) {
				// Error Exec: Обновление невозможно; блокировка установлена пользователем 'Fabula' на машине 'FABULA'.(1);
				// Error Exec: Обновление невозможно; установлена блокировка.
				// Error: Недопустимая закладка.(2);

				console.log("testError = ", testError);

				if (testError && !_testAttempts[testError]) {
					_testAttempts[testError] = 1;

					let errorResponseTemplate = {
						"err": testError,
						"t":0,
						"recs":0,
						"fld":[],
						"res":[]
					};

					Array.isArray(dbRes)
						? dbRes[0] = errorResponseTemplate
						: dbRes = errorResponseTemplate;
				}

				let str = JSON.stringify(dbRes),
					buf = iconv.encode(str, "win1251");

				res.end(buf);
			}
		});
	});
});


server.listen(port);