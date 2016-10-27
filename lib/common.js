/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_assert = require('assert-plus');
var mod_crypto = require('crypto');
var mod_path = require('path');
var mod_fs = require('fs');

function
lookup_vton(lt, v)
{
	mod_assert.arrayOfObject(lt);
	mod_assert.number(v);

	for (var i = 0; i < lt.length; i++) {
		var lte = lt[i];

		if (lte.v === v) {
			if (lte.e) {
				throw (new Error(lte.e));
			}
			return (lte.n);
		}
	}

	throw (new Error('invalid value ' + v + ' (' + Number(v).toString(16) +
	    ')'));
}

function
lookup_ntov(lt, n)
{
	mod_assert.arrayOfObject(lt);
	mod_assert.string(n);

	for (var i = 0; i < lt.length; i++) {
		var lte = lt[i];

		if (lte.n === n) {
			if (lte.e) {
				throw (new Error(lte.e));
			}
			return (lte.v);
		}
	}

	throw (new Error('invalid name ' + n));
}

function
bits_decode_array(def, val, outarr)
{
	mod_assert.object(def, 'def');
	mod_assert.number(val, 'val');
	mod_assert.array(outarr, 'outarr');

	for (var k in def) {
		if (!def.hasOwnProperty(k))
			continue;

		if ((def[k] & val) !== 0)
			outarr.push(k);
	}

	return (outarr);
}

function
bits_decode_object(def, val, outobj)
{
	mod_assert.object(def, 'def');
	mod_assert.number(val, 'val');
	mod_assert.object(outobj, 'outobj');

	for (var k in def) {
		if (!def.hasOwnProperty(k))
			continue;

		outobj[k] = ((def[k] & val) !== 0);
	}

	return (outobj);
}

function
dump_buf(name, buf)
{
	console.error('%s (%d bytes)', name, buf.length);
	var str = '';
	for (var i = 0; i < buf.length; i++) {
		var nstr = Number(buf[i]).toString(16);
		if (nstr.length === 1)
			nstr = '0' + nstr;
		if (i > 0 && i % 16 === 0)
			str += '\n';
		str += ' ' + nstr;
	}
	console.log(str);
}

module.exports = {
	lookup_ntov: lookup_ntov,
	lookup_vton: lookup_vton,

	bits_decode_array: bits_decode_array,
	bits_decode_object: bits_decode_object,

	dump_buf: dump_buf,
};
