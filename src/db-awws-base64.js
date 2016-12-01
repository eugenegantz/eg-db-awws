/**
 * Самописное Base64 шифрование
 * */
module.exports = {
	"_keyStr": "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",

	/**
	 * Закодировать строку в base64
	 * @param {String} input
	 * @return {String}
	 * */
	"encode": function(input) {
		if (!input) return "";

		var chr1, chr2, chr3, enc1, enc2, enc3, enc4,
			i = 0,
			output = "";

		input = this._utf8_encode(input);

		while (i < input.length) {
			chr1 = input.charCodeAt(i++);
			chr2 = input.charCodeAt(i++);
			chr3 = input.charCodeAt(i++);
			enc1 = chr1 >> 2;
			enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
			enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
			enc4 = chr3 & 63;

			if (isNaN(chr2))  enc3 = enc4 = 64;
			else if (isNaN(chr3)) enc4 = 64;

			output += this._keyStr.charAt(enc1) +
				this._keyStr.charAt(enc2) +
				this._keyStr.charAt(enc3) +
				this._keyStr.charAt(enc4);
		}

		return output.substr(4, 1) + output;
	},

	"_utf8_encode": function(string) {
		string = string.replace(/\r\n/g, "\n");

		var c, n, utftext = "";

		for (n = 0; n < string.length; n++) {
			c = string.charCodeAt(n);

			if (c < 128)
				utftext += String.fromCharCode(c);

			else if ((c > 127) && (c < 2048)) {
				utftext += String.fromCharCode((c >> 6) | 192);
				utftext += String.fromCharCode((c & 63) | 128);

			} else {
				utftext += String.fromCharCode((c >> 12) | 224);
				utftext += String.fromCharCode(((c >> 6) & 63) | 128);
				utftext += String.fromCharCode((c & 63) | 128);
			}
		}

		return utftext;
	}
};