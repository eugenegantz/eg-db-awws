"use strict";

const
	assert                  = require("assert"),
	Va                      = require("./../../src/db-awws-arg-validator.js");


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