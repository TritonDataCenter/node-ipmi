/* vim: set ts=8 sts=8 sw=8 noet: */

var mod_assert = require('assert-plus');

var lib_common = require('./common');

var lookup_ntov = lib_common.lookup_ntov;
var lookup_vton = lib_common.lookup_vton;

var RMCP_MESSAGE_CLASSES = [
	{ v: 0x6, n: 'asf' },
	{ v: 0x7, n: 'ipmi' },
	{ v: 0x8, n: 'oem' },
];

function
decode_class(byt)
{
	mod_assert.number(byt);
	mod_assert.ok(!isNaN(byt) && 0 <= byt && byt <= 255);

	var n = (0x1f & byt);

	var r = {
		t: (0x80 & byt) ? 'ack' : 'data',
		c: lookup_vton(RMCP_MESSAGE_CLASSES, n),
	};

	if (r.t === 'ack' && r.c !== 'asf') {
		/*
		 * If the message is an ACKnowledgement, it must be
		 * of class 'ASF'.
		 */
		throw (new Error('RMCP ACK must be class ASF'));
	}

	return (r);
}

function
encode_class(t, c)
{
	var ret = 0;

	switch (t) {
	case 'ack':
		ret |= 0x80;
		if (c !== 'asf') {
			throw (new Error('ACK messages must be class ASF'));
		}
		break;

	case 'data':
		break;

	default:
		throw (new Error('invalid type: ' + t));
	}

	ret |= lookup_ntov(RMCP_MESSAGE_CLASSES, c);

	return (ret);
}

function
decode_packet(buf)
{
	if (buf.length < 4) {
		throw (new Error('too short'));
	}

	var version = buf.readUInt8(0);

	if (version !== _.RMCP_VERSION) {
		throw (new Error('invalid RMCP version'));
	}

	var cb = decode_class(buf.readUInt8(3));
	if (cb === null) {
		throw (new Error('invalid message class byte'));
	}

	var rmcp = {
		rmcp_sequence: buf.readUInt8(2),
		rmcp_type: cb.t,
		rmcp_class: cb.c,
		rmcp_data: buf.slice(4)
	};

	if (rmcp.rmcp_type === 'ack' && buf.length !== 4) {
		throw (new Error('invalid length for ACK'));
	}

	return (rmcp);
}

function
encode_packet(rmcp)
{
	var buf = new Buffer(4 + rmcp.rmcp_data.length);

	buf.writeUInt8(_.RMCP_VERSION, 0);
	buf.writeUInt8(0, 1);
	buf.writeUInt8(255, 2);
	buf.writeUInt8(encode_class(rmcp.rmcp_type, rmcp.rmcp_class), 3);

	rmcp.rmcp_data.copy(buf, 4);

	return (buf);
}

var _ = module.exports = {
	RMCP_VERSION: 0x06,

	RMCP_PRIMARY_PORT: 623,
	RMCP_SECONDARY_PORT: 664,

	decode_class: decode_class,
	encode_class: encode_class,

	decode_packet: decode_packet,
	encode_packet: encode_packet
};
