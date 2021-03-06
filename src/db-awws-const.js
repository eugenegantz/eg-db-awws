"use strict";

var DB_CACHE_PREFIX_NO_CACHE = "*",
	DB_CACHE_PREFIX_NO_LOG = "**";

var DB_CACHE_PREFIXES = [
	DB_CACHE_PREFIX_NO_CACHE,
	DB_CACHE_PREFIX_NO_LOG
];

module.exports = {

	"DB_CACHE_PREFIX_NO_CACHE": DB_CACHE_PREFIX_NO_CACHE,

	"DB_CACHE_PREFIX_NO_LOG": DB_CACHE_PREFIX_NO_LOG,

	"DB_CACHE_PREFIXES": DB_CACHE_PREFIXES,

};