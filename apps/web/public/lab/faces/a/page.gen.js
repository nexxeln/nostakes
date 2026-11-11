// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Pipeable.js
var e = (e, t) => {
	switch (t.length) {
		case 0: return e;
		case 1: return t[0](e);
		case 2: return t[1](t[0](e));
		case 3: return t[2](t[1](t[0](e)));
		case 4: return t[3](t[2](t[1](t[0](e))));
		case 5: return t[4](t[3](t[2](t[1](t[0](e)))));
		case 6: return t[5](t[4](t[3](t[2](t[1](t[0](e))))));
		case 7: return t[6](t[5](t[4](t[3](t[2](t[1](t[0](e)))))));
		case 8: return t[7](t[6](t[5](t[4](t[3](t[2](t[1](t[0](e))))))));
		case 9: return t[8](t[7](t[6](t[5](t[4](t[3](t[2](t[1](t[0](e)))))))));
		default: {
			let n = e;
			for (let e = 0, r = t.length; e < r; e++) n = t[e](n);
			return n;
		}
	}
}, t = { pipe() {
	return e(this, arguments);
} }, n = /*#__PURE__*/ function() {
	function e() {}
	return e.prototype = t, e;
}(), r = function(e, t) {
	if (typeof e == "function") return function() {
		return e(arguments) ? t.apply(this, arguments) : (e) => t(e, ...arguments);
	};
	switch (e) {
		case 0:
		case 1: throw RangeError(`Invalid arity ${e}`);
		case 2: return function(e, n) {
			return arguments.length >= 2 ? t(e, n) : function(n) {
				return t(n, e);
			};
		};
		case 3: return function(e, n, r) {
			return arguments.length >= 3 ? t(e, n, r) : function(r) {
				return t(r, e, n);
			};
		};
		default: return function() {
			if (arguments.length >= e) return t.apply(this, arguments);
			let n = arguments;
			return function(e) {
				return t(e, ...n);
			};
		};
	}
}, i = (e) => e, a = (e) => () => e, o = /*#__PURE__*/ a(!0), s = /*#__PURE__*/ a(void 0), c = s;
function l(e) {
	let t = /* @__PURE__ */ new WeakMap();
	return (n) => {
		let r = t.get(n);
		if (r !== void 0) return r;
		let i = e(n);
		return t.set(n, i), i;
	};
}
function u(e) {
	let t = /* @__PURE__ */ new WeakMap();
	return (n) => {
		let r = t.get(n);
		if (r !== void 0) return r;
		let i = e(n);
		return t.set(n, i), i !== n && t.set(i, i), i;
	};
}
// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/equal.js
var d = (e) => {
	let t = new Set(Reflect.ownKeys(e));
	if (e.constructor === Object) return t;
	e instanceof Error && t.delete("stack");
	let n = Object.getPrototypeOf(e), r = n;
	for (; r !== null && r !== Object.prototype;) {
		let e = Reflect.ownKeys(r);
		for (let n = 0; n < e.length; n++) t.add(e[n]);
		r = Object.getPrototypeOf(r);
	}
	return t.has("constructor") && typeof e.constructor == "function" && n === e.constructor.prototype && t.delete("constructor"), t;
}, f = /*#__PURE__*/ new WeakSet(), p = (e) => new Uint8Array(e.buffer, e.byteOffset, e.byteLength), m = (e) => e instanceof ArrayBuffer || typeof SharedArrayBuffer < "u" && e instanceof SharedArrayBuffer, ee = (e) => {
	try {
		return new Uint8Array(e);
	} catch {
		return;
	}
}, te = 0, ne = () => {
	te++;
};
// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Predicate.js
function re(e) {
	return typeof e == "string";
}
function ie(e) {
	return typeof e == "number";
}
function ae(e) {
	return typeof e == "function";
}
function oe(e) {
	return e != null;
}
function se(e) {
	return !0;
}
function ce(e) {
	return typeof e == "object" && !!e || ae(e);
}
var h = /*#__PURE__*/ r(2, (e, t) => ce(e) && t in e), g = "~effect/Hash", _ = (e) => {
	switch (typeof e) {
		case "number": return me(e);
		case "bigint": return y(e.toString(10));
		case "string": return y(e);
		case "function":
		case "object":
			if (e === null) break;
			if (e instanceof Date) return Number.isNaN(e.getTime()) ? y("Invalid Date") : y(e.toISOString());
			if (e instanceof RegExp) return y(e.toString());
			{
				if (f.has(e)) return le(e);
				let t = Ce.get(e);
				if (t !== void 0) return t;
				if (we.has(e)) return ne(), y("[Circular]");
				we.add(e);
				let n = te, r;
				try {
					if (fe(e)) r = e[g]();
					else if (typeof e == "function") r = le(e);
					else if (m(e)) {
						let t = ee(e);
						r = t === void 0 ? le(e) : ve(t);
					} else r = e instanceof DataView ? ve(p(e)) : Array.isArray(e) || ArrayBuffer.isView(e) ? ve(e) : e instanceof Map ? ye(e) : e instanceof Set ? xe(e) : ge(e);
				} finally {
					we.delete(e);
				}
				return n === te && Ce.set(e, r), r;
			}
	}
	return de(ue(y(String(e))));
}, le = (e) => (Se.has(e) || Se.set(e, de(Math.random() * 4294967296 | 0)), Se.get(e)), ue = (e) => (e ^= e >>> 16, e = Math.imul(e, 2246822507), e ^= e >>> 13, e = Math.imul(e, 3266489909), e ^ e >>> 16), v = /*#__PURE__*/ r(2, (e, t) => ue(Math.imul(e, 2654435761) + Math.imul(t, 2246822507))), de = (e) => e & 3221225471 | e >>> 1 & 1073741824, fe = (e) => h(e, "~effect/Hash") && typeof e["~effect/Hash"] == "function", pe = /*#__PURE__*/ new DataView(/*#__PURE__*/ new ArrayBuffer(8)), me = (e) => {
	let t = e | 0;
	return t === e ? de(t) : (pe.setFloat64(0, e === e ? e : NaN), de(v(pe.getInt32(0), pe.getInt32(4))));
}, y = (e) => {
	let t = 5381, n = e.length;
	for (; n;) t = t * 33 ^ e.charCodeAt(--n);
	return de(t);
}, he = (e, t) => {
	let n = 12289;
	for (let r of t) n ^= v(_(r), _(e[r]));
	return de(n);
}, ge = (e) => he(e, d(e)), _e = (e, t) => (n) => {
	let r = e;
	for (let e of n) r ^= t(e);
	return de(r);
}, ve = (e) => {
	let t = 6151;
	for (let n of e) t = v(t, _(n));
	return de(t);
}, ye = /*#__PURE__*/ _e(/*#__PURE__*/ y("Map"), ([e, t]) => v(_(e), _(t))), be = /*#__PURE__*/ y("Set"), xe = /*#__PURE__*/ _e(be, (e) => v(be, _(e))), Se = /*#__PURE__*/ new WeakMap(), Ce = /*#__PURE__*/ new WeakMap(), we = /*#__PURE__*/ new WeakSet(), b = "~effect/Equal";
function x() {
	return arguments.length === 1 ? (e) => Te(e, arguments[0]) : Te(arguments[0], arguments[1]);
}
function Te(e, t) {
	if (e === t) return !0;
	if (e == null || t == null) return !1;
	let n = typeof e;
	return n === typeof t ? n === "number" && e !== e && t !== t ? !0 : n !== "object" && n !== "function" || f.has(e) || f.has(t) ? !1 : Ee(e, t) : !1;
}
function Ee(e, t) {
	let n = Oe.length;
	for (let r = n; r-- > 0;) if (Oe[r] === e && ke[r] === t) return !0;
	if (n) return De(e, t);
	let r = Ae.get(e);
	r || Ae.set(e, r = /* @__PURE__ */ new WeakMap());
	let i = r.get(t);
	return i === void 0 && r.set(t, i = De(e, t)), i;
}
function De(e, t) {
	Oe.push(e), ke.push(t);
	try {
		return je(e, t);
	} finally {
		Oe.pop(), ke.pop();
	}
}
var Oe = [], ke = [], Ae = /*#__PURE__*/ new WeakMap();
function je(e, t) {
	if (_(e) !== _(t)) return !1;
	if (e instanceof Date) {
		if (!(t instanceof Date)) return !1;
		let n = e.getTime(), r = t.getTime();
		return n === r || Number.isNaN(n) && Number.isNaN(r);
	}
	if (e instanceof RegExp) return t instanceof RegExp && e.toString() === t.toString();
	let n = Re(e);
	if (n !== Re(t) || typeof e == "function" && !n) return !1;
	if (n) return e[b](t);
	if (Array.isArray(e)) return !Array.isArray(t) || e.length !== t.length ? !1 : Me(e, t);
	if (m(e)) {
		if (!m(t) || e instanceof ArrayBuffer != t instanceof ArrayBuffer) return !1;
		let n = ee(e), r = ee(t);
		return n !== void 0 && r !== void 0 && Ne(n, r);
	}
	if (ArrayBuffer.isView(e)) {
		let n = e instanceof DataView;
		return !ArrayBuffer.isView(t) || e.byteLength !== t.byteLength || n !== t instanceof DataView ? !1 : n ? Ne(p(e), p(t)) : Ne(e, t);
	}
	return e instanceof Map ? !(t instanceof Map) || e.size !== t.size ? !1 : Fe(e, t, Ie, Le) : e instanceof Set ? !(t instanceof Set) || e.size !== t.size ? !1 : Fe(e, t, _, Te) : Pe(e, t);
}
function Me(e, t) {
	for (let n = 0; n < e.length; n++) if (!Te(e[n], t[n])) return !1;
	return !0;
}
function Ne(e, t) {
	if (e.length !== t.length) return !1;
	for (let n = 0; n < e.length; n++) if (e[n] !== t[n]) return !1;
	return !0;
}
function Pe(e, t) {
	let n = d(e), r = d(t);
	if (n.size !== r.size) return !1;
	for (let i of n) if (!r.has(i) || !Te(e[i], t[i])) return !1;
	return !0;
}
function Fe(e, t, n, r) {
	let i = /* @__PURE__ */ new Map(), a = 0;
	for (let e of t) {
		let t = n(e), r = i.get(t);
		r ? r.push(e) : i.set(t, [e]), a++;
	}
	outer: for (let t of e) {
		let e = i.get(n(t));
		if (e) {
			for (let n = 0; n < e.length; n++) if (r(t, e[n])) {
				e[n] = e[e.length - 1], e.pop(), a--;
				continue outer;
			}
		}
		return !1;
	}
	return a === 0;
}
var Ie = (e) => _(e[0]), Le = (e, t) => Te(e[0], t[0]) && Te(e[1], t[1]), Re = (e) => h(e, "~effect/Equal") && typeof e["~effect/Equal"] == "function", ze = /*#__PURE__*/ Symbol.for("~effect/Redactable"), Be = (e) => h(e, ze);
function Ve(e) {
	return Be(e) ? He(e) : e;
}
function He(e) {
	return e[ze](globalThis["~effect/Fiber/currentFiber"]?.context ?? Ge);
}
var Ue = "~effect/Fiber/currentFiber", We = /*#__PURE__*/ new Map(), Ge = {
	"~effect/Context": {},
	base: We,
	depth: 0,
	mapUnsafe: We,
	pipe() {
		return e(this, arguments);
	}
};
// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Formatter.js
function S(e, t) {
	let n = t?.space ?? 0, r = /* @__PURE__ */ new WeakSet(), i = n ? typeof n == "number" ? " ".repeat(n) : n : "", a = (e) => i.repeat(e), o = (e, t) => {
		let n = e?.constructor;
		return n && n !== Object.prototype.constructor && n.name ? `${n.name}(${t})` : t;
	}, s = (e) => {
		try {
			return Reflect.ownKeys(e);
		} catch {
			return ["[ownKeys threw]"];
		}
	};
	function c(e, t = 0) {
		try {
			return l(e, t);
		} catch {
			return (typeof e == "object" && e || typeof e == "function") && r.delete(e), "[inspection threw]";
		}
	}
	function l(e, n = 0) {
		if (typeof e == "string") return JSON.stringify(e);
		if (typeof e == "number" || e == null || typeof e == "boolean" || typeof e == "symbol") return String(e);
		if (typeof e == "bigint") return String(e) + "n";
		if (typeof e == "object" || typeof e == "function") {
			if (r.has(e)) return Ke;
			r.add(e);
			let l;
			if (ze in e) l = c(He(e), n);
			else if (Array.isArray(e)) l = !i || e.length <= 1 ? `[${e.map((e) => c(e, n)).join(",")}]` : `[\n${a(n + 1)}${e.map((e) => c(e, n + 1)).join(",\n" + a(n + 1))}\n${a(n)}]`;
			else if (e instanceof Date) l = Je(e);
			else if (!t?.ignoreToString && h(e, "toString") && typeof e.toString == "function" && e.toString !== Object.prototype.toString && e.toString !== Array.prototype.toString) {
				let t = Ye(e);
				l = e instanceof Error && e.cause !== void 0 ? `${t} (cause: ${c(e.cause, n)})` : t;
			} else if (Symbol.iterator in e) l = `${e.constructor.name}(${c(Array.from(e), n)})`;
			else {
				let t = s(e);
				if (!i || t.length <= 1) {
					let r = `{${t.map((t) => `${qe(t)}:${c(Xe(e, t), n)}`).join(",")}}`;
					l = o(e, r);
				} else {
					let r = `{\n${t.map((t) => `${a(n + 1)}${qe(t)}: ${c(Xe(e, t), n + 1)}`).join(",\n")}\n${a(n)}}`;
					l = o(e, r);
				}
			}
			return r.delete(e), l;
		}
		return String(e);
	}
	return c(e, 0);
}
var Ke = "[Circular]";
function qe(e) {
	return typeof e == "string" ? JSON.stringify(e) : String(e);
}
function Je(e) {
	try {
		return e.toISOString();
	} catch {
		return "Invalid Date";
	}
}
function Ye(e) {
	try {
		let t = e.toString();
		return typeof t == "string" ? t : String(t);
	} catch {
		return "[toString threw]";
	}
}
function Xe(e, t) {
	try {
		return e[t];
	} catch {
		return "[property access threw]";
	}
}
// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Inspectable.js
var Ze = /*#__PURE__*/ Symbol.for("nodejs.util.inspect.custom"), Qe = (e) => {
	try {
		return e = Ve(e), h(e, "toJSON") && ae(e.toJSON) && e.toJSON.length === 0 ? e.toJSON() : Array.isArray(e) ? e.map(Qe) : e;
	} catch {
		return "[toJSON threw]";
	}
}, C = {
	toJSON() {
		return Qe(this);
	},
	[Ze]() {
		return this.toJSON();
	},
	toString() {
		return S(this.toJSON());
	}
}, $e = /*#__PURE__*/ (() => {
	let e = Object.getOwnPropertyDescriptor(Error, "stackTraceLimit");
	return e === void 0 ? Object.isExtensible(Error) : Object.hasOwn(e, "writable") ? e.writable === !0 : e.set !== void 0;
})(), et = () => Error.stackTraceLimit, tt = (e) => {
	$e && (Error.stackTraceLimit = e);
}, nt = class {
	constructor(e) {
		this.value = e, this.done = !1;
	}
	next(e) {
		return this.done ? (this.value = e, this) : (this.done = !0, {
			value: this.value,
			done: !1
		});
	}
}, rt = /*#__PURE__*/ (() => {
	let e = "~effect/Utils/internal", t = { [e]: (e) => e() }, n = { [e]: (e) => {
		try {
			return e();
		} finally {}
	} }, r = et();
	if (r === 0) return n[e];
	tt(2);
	let i = t[e](() => /* @__PURE__ */ Error());
	return tt(r), i.stack?.includes(e) === !0 ? t[e] : n[e];
})();
// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/record.js
function it(e, t, n) {
	t === "__proto__" ? Object.defineProperty(e, t, {
		value: n,
		writable: !0,
		enumerable: !0,
		configurable: !0
	}) : e[t] = n;
}
function at(e, t) {
	if (!Object.hasOwn(t, "__proto__")) Object.assign(e, t);
	else for (let n of Reflect.ownKeys(t)) Object.prototype.propertyIsEnumerable.call(t, n) && it(e, n, t[n]);
}
// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/core.js
var ot = "~effect/Effect", st = "~effect/Exit", ct = {
	_A: i,
	_E: i,
	_R: i
}, lt = `${ot}/identifier`, w = `${ot}/args`, T = `${ot}/evaluate`, E = `${ot}/successCont`, ut = `${ot}/failureCont`, dt = `${ot}/ensureCont`, ft = /*#__PURE__*/ Symbol.for("effect/Effect/Yield"), pt = {
	pipe() {
		return e(this, arguments);
	},
	toJSON() {
		return { ...this };
	},
	toString() {
		return S(this.toJSON(), {
			ignoreToString: !0,
			space: 2
		});
	},
	[Ze]() {
		return this.toJSON();
	}
}, mt = {
	[ot]: ct,
	...pt,
	[Symbol.iterator]() {
		return new nt(this);
	},
	toJSON() {
		return {
			_id: "Effect",
			op: this[lt],
			..."~effect/Effect/args" in this ? { args: this[w] } : void 0
		};
	}
}, ht = (e) => h(e, st), gt = "~effect/Cause", _t = "~effect/Cause/Reason", vt = (e) => h(e, gt), yt = class {
	constructor(e) {
		this[gt] = gt, this.reasons = e;
	}
	pipe() {
		return e(this, arguments);
	}
	toJSON() {
		return {
			_id: "Cause",
			reasons: this.reasons.map((e) => e.toJSON())
		};
	}
	toString() {
		return `Cause(${S(this.reasons)})`;
	}
	[Ze]() {
		return this.toJSON();
	}
	[b](e) {
		return vt(e) && this.reasons.length === e.reasons.length && this.reasons.every((t, n) => x(t, e.reasons[n]));
	}
	[g]() {
		return ve(this.reasons);
	}
}, bt = /*#__PURE__*/ new WeakMap(), xt = class {
	[_t];
	annotations;
	_tag;
	constructor(e, t, n) {
		if (this[_t] = _t, this._tag = e, t !== St && typeof n == "object" && n && t.size > 0) {
			let e = bt.get(n);
			e && (t = new Map([...e, ...t])), bt.set(n, t);
		}
		this.annotations = t;
	}
	annotate(e, t) {
		if (e.mapUnsafe.size === 0) return this;
		let n = new Map(this.annotations);
		if (e.mapUnsafe.forEach((e, r) => {
			t?.overwrite !== !0 && n.has(r) || n.set(r, e);
		}), t?.overwrite !== !0 && n.size === this.annotations.size) return this;
		let r = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
		return r.annotations = n, r;
	}
	pipe() {
		return e(this, arguments);
	}
	toString() {
		return S(this);
	}
	[Ze]() {
		return this.toString();
	}
}, St = /*#__PURE__*/ new Map(), Ct = class extends xt {
	constructor(e, t = St) {
		super("Fail", t, e), this.error = e;
	}
	toString() {
		return `Fail(${S(this.error)})`;
	}
	toJSON() {
		return {
			_tag: "Fail",
			error: this.error
		};
	}
	[b](e) {
		return Mt(e) && x(this.error, e.error) && x(this.annotations, e.annotations);
	}
	[g]() {
		return v(y(this._tag))(v(_(this.error))(_(this.annotations)));
	}
}, wt = (e) => new yt(e), Tt = (e, t) => {
	let n = /* @__PURE__ */ new Map(), r = [];
	for (let i of e.concat(t)) {
		let e = _(i), t = n.get(e);
		if (t === void 0) n.set(e, [i]);
		else if (t.some((e) => x(e, i))) continue;
		else t.push(i);
		r.push(i);
	}
	return r;
}, Et = /*#__PURE__*/ r(2, (e, t) => {
	if (e.reasons.length === 0) return t;
	if (t.reasons.length === 0) return e;
	let n = new yt(Tt(e.reasons, t.reasons));
	return x(e, n) ? e : n;
}), Dt = (e, t) => {
	let n = e.reasons.slice();
	for (let e of t.reasons) Pt(e) && !n.some((t) => Pt(t) && t.fiberId === e.fiberId && t.annotations === e.annotations) && n.push(e);
	return n.length === e.reasons.length ? e : new yt(n);
}, Ot = (e) => new yt([new Ct(e)]), kt = class extends xt {
	constructor(e, t = St) {
		super("Die", t, e), this.defect = e;
	}
	toString() {
		return `Die(${S(this.defect)})`;
	}
	toJSON() {
		return {
			_tag: "Die",
			defect: this.defect
		};
	}
	[b](e) {
		return Nt(e) && x(this.defect, e.defect) && x(this.annotations, e.annotations);
	}
	[g]() {
		return v(y(this._tag))(v(_(this.defect))(_(this.annotations)));
	}
}, At = (e) => new yt([new kt(e)]), jt = /*#__PURE__*/ r((e) => vt(e[0]), (e, t, n) => t.mapUnsafe.size === 0 ? e : new yt(e.reasons.map((e) => e.annotate(t, n)))), Mt = (e) => e._tag === "Fail", Nt = (e) => e._tag === "Die", Pt = (e) => e._tag === "Interrupt";
function Ft(e) {
	return Ut("Effect.evaluate: Not implemented");
}
var It = (e) => ({
	...mt,
	[lt]: e.op,
	[T]: e["~effect/Effect/evaluate"] ?? Ft,
	[E]: e[E],
	[ut]: e[ut],
	[dt]: e[dt]
}), Lt = (e) => {
	let t = It(e), n = function(e) {
		this[w] = e;
	};
	return n.prototype = t, function(e) {
		return new n(e);
	};
}, Rt = (e) => {
	let t = {
		[st]: st,
		_tag: e.op,
		get [e.prop]() {
			return this[w];
		},
		...It(e),
		toString() {
			return `${e.op}(${S(this[w])})`;
		},
		toJSON() {
			return {
				_id: "Exit",
				_tag: e.op,
				[e.prop]: this[w]
			};
		},
		[b](e) {
			return ht(e) && e._tag === this._tag && x(this["~effect/Effect/args"], e["~effect/Effect/args"]);
		},
		[g]() {
			return v(y(e.op), _(this[w]));
		}
	}, n = function(e) {
		this[w] = e;
	};
	return n.prototype = t, function(e) {
		return new n(e);
	};
}, D = /*#__PURE__*/ Rt({
	op: "Success",
	prop: "value",
	[T](e) {
		let t = e.getCont(E);
		return t ? t[E](this[w], e, this) : e.yieldWith(this);
	}
}), zt = { key: "effect/Cause/StackTrace" }, Bt = { key: "effect/Cause/InterruptorStackTrace" }, Vt = /*#__PURE__*/ Rt({
	op: "Failure",
	prop: "cause",
	[T](e) {
		let t = this[w], n = !1;
		e.cache.stackFrame && (t = jt(t, { mapUnsafe: /* @__PURE__ */ new Map([[zt.key, e.cache.stackFrame]]) }), n = !0);
		let r = e.getCont(ut), i = e._interruptedCause;
		if (i && e.interruptible) {
			let a = !1;
			for (; r && e.interruptible;) a ||= lt in r, r = e.getCont(ut);
			a && (t = wt(t.reasons.filter((e) => e._tag !== "Fail"))), t = Dt(t, i), n = !0;
		}
		return r ? r[ut](t, e, n ? void 0 : this) : e.yieldWith(n ? Vt(t) : this);
	}
}), Ht = (e) => Vt(Ot(e)), Ut = (e) => Vt(At(e)), Wt = /*#__PURE__*/ Lt({
	op: "WithFiber",
	[T](e) {
		return this[w](e);
	}
}), Gt = /*#__PURE__*/ function() {
	class e extends globalThis.Error {}
	let t = /*#__PURE__*/ It({
		op: "YieldableError",
		[T]() {
			return Ht(this);
		}
	});
	return delete t.toString, Object.assign(e.prototype, t), e;
}(), Kt = /*#__PURE__*/ function() {
	let e = /*#__PURE__*/ Symbol.for("effect/Data/Error/plainArgs");
	return class extends Gt {
		constructor(t) {
			super(t?.message, t?.cause ? { cause: t.cause } : void 0), t && (at(this, t), Object.defineProperty(this, e, {
				value: t,
				enumerable: !1
			}));
		}
		toJSON() {
			return {
				...this[e],
				...this
			};
		}
	};
}(), qt = (e) => {
	class t extends Kt {
		_tag = e;
	}
	return t.prototype.name = e, t;
}, Jt = "~effect/Cause/Done", Yt = (e) => h(e, Jt), Xt = (e) => It({
	op: e.label,
	[T]: e.evaluate
}), Zt = "~effect/Option", Qt = {
	[Zt]: { _A: (e) => e },
	...pt,
	[Symbol.iterator]() {
		return new nt(this);
	}
}, $t = /*#__PURE__*/ Object.defineProperty(/*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(Qt), {
	_tag: "Some",
	_op: "Some",
	[b](e) {
		return nn(e) && an(e) && x(this.value, e.value);
	},
	[g]() {
		return v(_(this._tag))(_(this.value));
	},
	toString() {
		return `some(${S(this.value)})`;
	},
	toJSON() {
		return {
			_id: "Option",
			_tag: this._tag,
			value: Qe(this.value)
		};
	}
}), "valueOrUndefined", { get() {
	return this.value;
} }), en = /*#__PURE__*/ _("None"), tn = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(Qt), {
	_tag: "None",
	_op: "None",
	valueOrUndefined: void 0,
	[b](e) {
		return nn(e) && rn(e);
	},
	[g]() {
		return en;
	},
	toString() {
		return "none()";
	},
	toJSON() {
		return {
			_id: "Option",
			_tag: this._tag
		};
	}
}), nn = (e) => h(e, Zt), rn = (e) => e._tag === "None", an = (e) => e._tag === "Some", on = /*#__PURE__*/ Object.create(tn), sn = function(e) {
	this.value = e;
};
sn.prototype = $t;
var cn = (e) => new sn(e);
({ ...pt });
// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Order.js
function ln(e) {
	return (t, n) => t === n ? 0 : e(t, n);
}
var un = /*#__PURE__*/ ln((e, t) => e < t ? -1 : 1), dn = () => on, fn = cn, pn = "~effect/Context/Service", mn = function() {
	function e() {}
	let t = e;
	Object.setPrototypeOf(t, hn);
	let n = (e, n) => (t.key = e, n?.defaultValue && (t[_n] = _n, t.defaultValue = n.defaultValue), n?.make && (t.make = n.make), n?.fiberCached && gn.add(e), t);
	return arguments.length > 0 ? n(arguments[0], arguments[1]) : n;
}, hn = {
	[pn]: pn,
	.../*#__PURE__*/ Xt({
		label: "Service",
		evaluate(e) {
			return D(O(e.context, this));
		}
	}),
	toJSON() {
		return {
			_id: "Service",
			key: this.key
		};
	},
	of(e) {
		return e;
	},
	context(e) {
		return Mn(this, e);
	},
	use(e) {
		return Wt((t) => e(O(t.context, this)));
	},
	useSync(e) {
		return Wt((t) => D(e(O(t.context, this))));
	}
}, gn = /*#__PURE__*/ new Set(), _n = "~effect/Context/Reference", vn = "~effect/Context", yn = 8, bn = (e, t, n, r, i) => {
	let a = Object.create(En);
	return a.cacheRoot = e ?? a, a.base = t, a.overlay = n, a.depth = r, a._flat = void 0, a.baseHits = 0, a.maxDepth = i, a;
}, xn = (e, t) => {
	t && (xn(e, t.parent), e.set(t.key, t.value));
}, Sn = (e) => {
	if (e._flat) return e._flat;
	if (!e.overlay) return e._flat = e.base;
	let t = new Map(e.base);
	return xn(t, e.overlay), e._flat = t;
}, Cn = /*#__PURE__*/ Symbol(), wn = (e, t) => {
	let n = e;
	for (let e = n.overlay; e; e = e.parent) if (e.key === t) return e.value;
	let r = n.base.get(t);
	return r === void 0 && !n.base.has(t) ? Cn : (n.overlay && ++n.baseHits >= n.base.size && n.baseHits >= yn && (n.base = Sn(n), n.overlay = void 0, n.depth = 0), r);
}, Tn = (e, t) => {
	let n = t?.maxDepth;
	return bn(void 0, e, void 0, 0, Number.isInteger(n) && n >= 0 ? n : 8);
}, En = {
	get mapUnsafe() {
		return Sn(this);
	},
	...pt,
	[vn]: { _Services: (e) => e },
	toJSON() {
		return {
			_id: "Context",
			services: Array.from(this.mapUnsafe).map(([e, t]) => ({
				key: e,
				value: t
			}))
		};
	},
	[b](e) {
		if (!On(e)) return !1;
		let t = this.mapUnsafe, n = e.mapUnsafe;
		if (t.size !== n.size) return !1;
		for (let [e, r] of t) if (!n.has(e) || !x(r, n.get(e))) return !1;
		return !0;
	},
	[g]() {
		return me(this.mapUnsafe.size);
	}
}, Dn = (e, t) => e.cacheRoot === t.cacheRoot, On = (e) => h(e, vn), kn = (e) => !!e[_n], An = () => jn, jn = /*#__PURE__*/ Tn(/*#__PURE__*/ new Map()), Mn = (e, t) => Tn(/* @__PURE__ */ new Map([[e.key, t]])), Nn = /*#__PURE__*/ r(3, (e, t, n) => Pn(e, t.key, n)), Pn = (e, t, n) => {
	let r = e, i = gn.has(t) ? void 0 : r.cacheRoot;
	if (r.depth >= r.maxDepth) {
		let e = new Map(r._flat ?? r.base);
		return r._flat || xn(e, r.overlay), e.set(t, n), bn(i, e, void 0, 0, r.maxDepth);
	}
	return bn(i, r.base, {
		key: t,
		value: n,
		parent: r.overlay
	}, r.depth + 1, r.maxDepth);
}, Fn = (e, t) => {
	let n = wn(e, t);
	return n === Cn ? void 0 : n;
}, O = /* @__PURE__ */ r(2, (e, t) => {
	let n = wn(e, t.key);
	if (n === Cn) {
		if (kn(t)) return Ln(t);
		throw Rn(t);
	}
	return n;
}), In = "~effect/Context/defaultValue", Ln = (e) => In in e ? e[In] : e[In] = e.defaultValue(), Rn = (e) => {
	let t = /* @__PURE__ */ Error(`Service not found${e.key ? `: ${String(e.key)}` : ""}`);
	if (t.stack) {
		let e = t.stack.split("\n");
		e.splice(1, 3), t.stack = e.join("\n");
	}
	return t;
}, zn = mn, Bn = (e) => e.length > 0, Vn = globalThis.Array, Hn = /*#__PURE__*/ r(2, (e, t) => [...e, t]);
Vn.isArray;
var Un = Bn, Wn = Bn, Gn = () => [], Kn = /*#__PURE__*/ r(2, (e, t) => e.map(t)), qn = "~effect/Duration", Jn = /*#__PURE__*/ BigInt(0), Yn = /*#__PURE__*/ BigInt(1), Xn = /*#__PURE__*/ BigInt(2), Zn = /*#__PURE__*/ BigInt(10), Qn = /*#__PURE__*/ BigInt(1e3), $n = /*#__PURE__*/ BigInt(1e6), er = /*#__PURE__*/ BigInt(1e9), tr = /*#__PURE__*/ BigInt(6e10), nr = /*#__PURE__*/ BigInt(36e11), rr = /*#__PURE__*/ BigInt(864e11), ir = /*#__PURE__*/ BigInt(6048e11), ar = (e) => BigInt(Math.sign(e) * Math.round(Math.abs(e))), or = (e) => Number.isInteger(e) ? BigInt(e) * $n : ar(e * 1e6), sr = (e) => k(Number.isFinite(e) ? ar(e) : e), cr = (e, t) => {
	let n = e.indexOf(".");
	if (n === -1) return BigInt(e) * t;
	let r = e[0] === "-", i = e.slice(n + 1), a = Zn ** BigInt(i.length), o = (BigInt(e.slice(+!!r, n)) * a + BigInt(i)) * t;
	return lr(r ? -o : o, a);
}, lr = (e, t) => {
	let n = e < Jn ? -e : e, r = n / t + (n % t * Xn >= t ? Yn : Jn);
	return e < Jn ? -r : r;
}, ur = (e, t) => {
	let n = Number(e) * t;
	if (!Number.isFinite(n)) return k(n);
	let r = cr(e, BigInt(t) * $n);
	return k(Number.isInteger(n) && BigInt(n) * $n === r ? n : r);
}, dr = /^(-?\d+(?:\.\d+)?)\s+(nanos?|micros?|millis?|seconds?|minutes?|hours?|days?|weeks?)$/, fr = (e) => {
	switch (typeof e) {
		case "number": return Tr(e);
		case "bigint": return wr(e);
		case "string": {
			if (e === "Infinity") return Sr;
			if (e === "-Infinity") return Cr;
			let t = dr.exec(e);
			if (!t) break;
			let [n, r, i] = t;
			if (i === "nano" || i === "nanos") return wr(cr(r, Yn));
			if (i === "micro" || i === "micros") return wr(cr(r, Qn));
			switch (i) {
				case "milli":
				case "millis": return ur(r, 1);
				case "second":
				case "seconds": return ur(r, 1e3);
				case "minute":
				case "minutes": return ur(r, 6e4);
				case "hour":
				case "hours": return ur(r, 36e5);
				case "day":
				case "days": return ur(r, 864e5);
				case "week":
				case "weeks": return ur(r, 6048e5);
			}
			break;
		}
		case "object": {
			if (e === null) break;
			if (qn in e) return e;
			if (Array.isArray(e)) {
				if (e.length !== 2 || !e.every(ie)) return hr(e);
				if (Number.isNaN(e[0]) || Number.isNaN(e[1])) return xr;
				if (e[0] === -Infinity || e[1] === -Infinity) return Cr;
				if (e[0] === Infinity || e[1] === Infinity) return Sr;
				let t = e[0] * 1e9 + e[1];
				return Number.isFinite(t) && Number.isInteger(e[0]) && Number.isInteger(e[1]) ? k(BigInt(e[0]) * er + BigInt(e[1])) : sr(t);
			}
			let t = e, n = 0;
			if (t.weeks && (n += t.weeks * 6048e5), t.days && (n += t.days * 864e5), t.hours && (n += t.hours * 36e5), t.minutes && (n += t.minutes * 6e4), t.seconds && (n += t.seconds * 1e3), t.milliseconds && (n += t.milliseconds), !t.microseconds && !t.nanoseconds) {
				if (!Number.isFinite(n)) return k(n);
				let e = mr(t);
				return e === void 0 || BigInt(n) * $n === e ? k(n) : k(e);
			}
			let r = n * 1e6 + (t.microseconds ?? 0) * 1e3 + (t.nanoseconds ?? 0), i = Number.isFinite(r) ? mr(t) : void 0;
			return i === void 0 ? sr(r) : k(i);
		}
	}
	return hr(e);
}, pr = (e) => !e || Number.isInteger(e), mr = (e) => {
	if (!pr(e.weeks) || !pr(e.days) || !pr(e.hours) || !pr(e.minutes) || !pr(e.seconds) || !pr(e.milliseconds) || !pr(e.microseconds) || !pr(e.nanoseconds)) return;
	let t = Jn;
	return e.weeks && (t += BigInt(e.weeks) * ir), e.days && (t += BigInt(e.days) * rr), e.hours && (t += BigInt(e.hours) * nr), e.minutes && (t += BigInt(e.minutes) * tr), e.seconds && (t += BigInt(e.seconds) * er), e.milliseconds && (t += BigInt(e.milliseconds) * $n), e.microseconds && (t += BigInt(e.microseconds) * Qn), e.nanoseconds && (t += BigInt(e.nanoseconds)), t;
}, hr = (e) => {
	throw Error(`Invalid Input: ${e}`);
}, gr = {
	_tag: "Millis",
	millis: 0
}, _r = { _tag: "Infinity" }, vr = { _tag: "NegativeInfinity" }, yr = {
	[qn]: qn,
	[g]() {
		switch (this.value._tag) {
			case "Millis": return _(or(this.value.millis));
			case "Nanos": return _(this.value.nanos);
			default: return ge(this.value);
		}
	},
	[b](e) {
		return br(e) && kr(this, e);
	},
	toString() {
		switch (this.value._tag) {
			case "Infinity": return "Infinity";
			case "NegativeInfinity": return "-Infinity";
			case "Nanos": return `${this.value.nanos} nanos`;
			case "Millis": return `${this.value.millis} millis`;
		}
	},
	toJSON() {
		switch (this.value._tag) {
			case "Millis": return {
				_id: "Duration",
				_tag: "Millis",
				millis: this.value.millis
			};
			case "Nanos": return {
				_id: "Duration",
				_tag: "Nanos",
				nanos: String(this.value.nanos)
			};
			case "Infinity": return {
				_id: "Duration",
				_tag: "Infinity"
			};
			case "NegativeInfinity": return {
				_id: "Duration",
				_tag: "NegativeInfinity"
			};
		}
	},
	[Ze]() {
		return this.toJSON();
	},
	pipe() {
		return e(this, arguments);
	}
}, k = (e) => {
	let t = Object.create(yr);
	return t.value = typeof e == "number" ? isNaN(e) || e === 0 || Object.is(e, -0) ? gr : Number.isFinite(e) ? Number.isInteger(e) ? {
		_tag: "Millis",
		millis: e
	} : {
		_tag: "Nanos",
		nanos: or(e)
	} : e > 0 ? _r : vr : e === Jn ? gr : {
		_tag: "Nanos",
		nanos: e
	}, t;
}, br = (e) => h(e, qn), xr = /*#__PURE__*/ k(0), Sr = /*#__PURE__*/ k(Infinity), Cr = /*#__PURE__*/ k(-Infinity), wr = (e) => k(e), Tr = (e) => k(e), Er = (e) => {
	let t = fr(e);
	switch (t.value._tag) {
		case "Infinity":
		case "NegativeInfinity": throw Error("Cannot convert infinite duration to nanos");
		case "Nanos": return t.value.nanos;
		case "Millis": return or(t.value.millis);
	}
}, Dr = /*#__PURE__*/ r(3, (e, t, n) => e.value._tag === "Infinity" || e.value._tag === "NegativeInfinity" || t.value._tag === "Infinity" || t.value._tag === "NegativeInfinity" ? n.onInfinity(e, t) : e.value._tag === "Millis" ? t.value._tag === "Millis" ? n.onMillis(e.value.millis, t.value.millis) : n.onNanos(Er(e), t.value.nanos) : n.onNanos(e.value.nanos, Er(t))), Or = (e, t) => Dr(e, t, {
	onMillis: (e, t) => e === t,
	onNanos: (e, t) => e === t,
	onInfinity: (e, t) => e.value._tag === t.value._tag
}), kr = /*#__PURE__*/ r(2, (e, t) => Or(e, t)), Ar = /*#__PURE__*/ zn("effect/Scheduler", {
	fiberCached: !0,
	defaultValue: () => new Fr()
}), jr = (e) => {
	let t = !1;
	return Promise.resolve().then(() => {
		t || e();
	}), () => {
		t = !0;
	};
}, Mr = "setImmediate" in globalThis ? (e) => {
	let t = globalThis.setImmediate(e);
	return () => globalThis.clearImmediate(t);
} : (e) => {
	let t = setTimeout(e, 0);
	return () => clearTimeout(t);
}, Nr = (e) => {
	try {
		return Mr(e);
	} catch {
		return jr(e);
	}
}, Pr = class {
	buckets = [];
	scheduleTask(e, t) {
		let n = this.buckets, r = n.length, i, a = 0;
		for (; a < r && !(n[a][0] > t); a++) i = n[a];
		i && i[0] === t ? i[1].push(e) : a === r ? n.push([t, [e]]) : n.splice(a, 0, [t, [e]]);
	}
	drain() {
		let e = this.buckets;
		return this.buckets = [], e;
	}
}, Fr = class {
	executionMode;
	setImmediate;
	constructor(e = "async", t) {
		this.executionMode = e, this.setImmediate = t ?? (e === "sync" ? jr : Nr);
	}
	shouldYield(e) {
		return e.currentOpCount >= e.cache.maxOpsBeforeYield;
	}
	makeDispatcher() {
		return new Ir(this.setImmediate);
	}
}, Ir = class {
	tasks = /*#__PURE__*/ new Pr();
	running = void 0;
	setImmediate;
	constructor(e = Nr) {
		this.setImmediate = e;
	}
	scheduleTask(e, t) {
		this.tasks.scheduleTask(e, t), this.running === void 0 && (this.running = this.setImmediate(this.afterScheduled));
	}
	afterScheduled = () => {
		this.running = void 0, this.runTasks();
	};
	runTasks() {
		let e = this.tasks.drain();
		for (let t = 0; t < e.length; t++) {
			let n = e[t][1];
			for (let e = 0; e < n.length; e++) n[e]();
		}
	}
	flush() {
		for (; this.tasks.buckets.length > 0;) this.running !== void 0 && (this.running(), this.running = void 0), this.runTasks();
	}
}, Lr = /*#__PURE__*/ zn("effect/Scheduler/MaxOpsBeforeYield", {
	fiberCached: !0,
	defaultValue: () => 2048
}), Rr = /*#__PURE__*/ zn("effect/Scheduler/PreventSchedulerYield", {
	fiberCached: !0,
	defaultValue: () => !1
}), zr = "effect/Tracer/ParentSpan", Br = "effect/Tracer", Vr = "effect/Metric/FiberRuntimeMetrics", Hr = /*#__PURE__*/ zn("effect/References/CurrentStackFrame", {
	fiberCached: !0,
	defaultValue: s
}), Ur = /*#__PURE__*/ zn("effect/References/TracerEnabled", {
	fiberCached: !0,
	defaultValue: o
}), Wr = /*#__PURE__*/ zn("effect/References/CurrentLogLevel", {
	fiberCached: !0,
	defaultValue: () => "Info"
}), Gr = /*#__PURE__*/ zn("effect/References/MinimumLogLevel", {
	fiberCached: !0,
	defaultValue: () => "Info"
}), Kr = class extends xt {
	constructor(e, t = St) {
		super("Interrupt", t, "Interrupted"), this.fiberId = e;
	}
	toString() {
		return `Interrupt(${this.fiberId})`;
	}
	toJSON() {
		return {
			_tag: "Interrupt",
			fiberId: this.fiberId
		};
	}
	[b](e) {
		return Pt(e) && this.fiberId === e.fiberId && this.annotations === e.annotations;
	}
	[g]() {
		return y(`${this._tag}:${this.fiberId}`);
	}
}, qr = (e) => new yt([new Kr(e)]), Jr = (e) => e.reasons.some(Mt), Yr = (e) => e.reasons.some(Nt), Xr = (e) => Yr(e) && Jr(e) ? wt(e.reasons.map((e) => e._tag === "Fail" && !Yt(e.error) ? new kt(e.error, e.annotations) : e)) : e, Zr = (e) => e.reasons.some(Pt), Qr = /*#__PURE__*/ r(2, (e, t) => {
	let n = !1, r = e.reasons.map((e) => Mt(e) ? (n = !0, new Ct(t(e.error), e.annotations)) : e);
	return n ? wt(r) : e;
}), $r = "~effect/Fiber", ei = {
	_A: i,
	_E: i
}, ti = { id: 0 }, ni = /*#__PURE__*/ (() => {
	try {
		return globalThis.process?.getBuiltinModule?.("node:async_hooks")?.AsyncResource;
	} catch {
		return;
	}
})(), ri = () => ni === void 0 ? void 0 : new ni("effect/Fiber"), ii = () => globalThis[Ue], ai = class {
	constructor(e, t = !0) {
		this.setContext(e), this.id = ++ti.id, this.currentOpCount = 0, this.interruptible = t, this._stack = [], this._observers = void 0, this._exit = void 0, this._children = void 0, this._interruptedCause = void 0, this._yielded = void 0, this._running = !1, this._deferredInterrupt = !1, this._parent = void 0, this._asyncContext = void 0, this.cache.runtimeMetrics?.recordFiberStart(this.context);
	}
	get [$r]() {
		return ei;
	}
	get currentDispatcher() {
		return this._dispatcher ??= this.cache.scheduler.makeDispatcher();
	}
	getRef(e) {
		return O(this.context, e);
	}
	addObserver(e) {
		return this._exit ? (e(this._exit), c) : (this._observers === void 0 ? this._observers = [e] : this._observers.push(e), () => this.removeObserver(e));
	}
	removeObserver(e) {
		if (this._exit || this._observers === void 0) return;
		let t = this._observers.indexOf(e);
		t >= 0 && this._observers.splice(t, 1);
	}
	interruptUnsafe(e, t) {
		if (this._exit) return;
		let n = qr(e);
		this.cache.stackFrame && (n = jt(n, Mn(zt, this.cache.stackFrame))), t && (n = jt(n, t)), this._interruptedCause = this._interruptedCause ? Dt(this._interruptedCause, n) : n, this.interruptible && (this._running ? this._deferredInterrupt = !0 : this.evaluate(mi(this._interruptedCause)));
	}
	pollUnsafe() {
		return this._exit;
	}
	evaluate(e) {
		if (this._exit) return;
		if (this._asyncContext !== void 0) {
			let t = this._asyncContext;
			this._asyncContext = void 0;
			try {
				return t.runInAsyncScope(this.evaluate, this, e);
			} finally {
				t.emitDestroy();
			}
		} else if (this._yielded !== void 0) {
			let e = this._yielded;
			this._yielded = void 0, e();
		}
		let t = this.runLoop(e);
		if (t === ft) {
			this._asyncContext = ri();
			return;
		}
		let n = li.interruptChildren && li.interruptChildren(this);
		if (n !== void 0) return this.evaluate(Ri(n, () => t));
		if (this._exit = t, this.cache.runtimeMetrics?.recordFiberEnd(this.context, this._exit), this._parent &&= (this._parent._children?.delete(this), void 0), this._observers !== void 0) {
			let e = this._observers;
			this._observers = void 0;
			for (let n = 0; n < e.length; n++) e[n](t);
		}
		this._stack.length = 0, this._children = void 0, this.context = An();
		let r = this.cache;
		(r.span !== void 0 || r.stackFrame !== void 0) && (this.cache = {
			...r,
			span: void 0,
			stackFrame: void 0
		});
	}
	runLoop(e) {
		let t = globalThis[Ue];
		globalThis[Ue] = this;
		let n = this._running;
		this._running = !0;
		let r = !1, i = e;
		this.currentOpCount = 0;
		try {
			for (;;) try {
				this._deferredInterrupt && (this._deferredInterrupt = !1, i = mi(this._interruptedCause)), this.currentOpCount++;
				let e = this.cache;
				if (!r && !e.preventYield && e.scheduler.shouldYield(this)) {
					r = !0;
					let e = i;
					i = Ri(vi, () => e);
				}
				if (i = e.tracerContext ? e.tracerContext(i, this) : i[T](this), i === ft) {
					let e = this._yielded;
					if ("~effect/Exit" in e) return this._deferredInterrupt = !1, this._yielded = void 0, e;
					if (this._deferredInterrupt) {
						this._yielded = void 0, e();
						continue;
					}
					return ft;
				}
			} catch (e) {
				if (!h(i, "~effect/Effect/evaluate")) return Ut(`Fiber.runLoop: Not a valid effect: ${String(i)}`);
				i = Ut(e);
			}
		} finally {
			this._running = n, globalThis[Ue] = t;
		}
	}
	getCont(e) {
		if (this._deferredInterrupt) return this._deferredInterrupt = !1, si;
		for (;;) {
			let t = this._stack.pop();
			if (!t) return;
			let n = t[dt];
			if (n !== void 0) {
				let r = n.call(t, this);
				if (r) return r[e] = r, r;
			}
			if (t[e]) return t;
		}
	}
	succeedWith(e) {
		if (!(++this.currentOpCount & ci - 1)) return D(e);
		let t = this.getCont(E);
		return t ? t[E](e, this) : this.yieldWith(D(e));
	}
	yieldWith(e) {
		return this._yielded = e, ft;
	}
	children() {
		return this._children ??= /* @__PURE__ */ new Set();
	}
	pipe() {
		return e(this, arguments);
	}
	setContext(e) {
		let t = this.context;
		if (this.context = e, t !== void 0 && Dn(t, e)) return;
		let n = e.cacheRoot, r = n._fiberCache ??= oi(e);
		this.cache?.scheduler !== r.scheduler && (this._dispatcher = void 0), this.cache = r;
	}
	get currentSpanLocal() {
		let e = this.cache.span;
		return e?._tag === "Span" ? e : void 0;
	}
}, oi = (e) => {
	let t = Fn(e, Br);
	return {
		scheduler: O(e, Ar),
		tracer: t,
		tracerContext: t ? t.context : void 0,
		tracerEnabled: O(e, Ur),
		span: Fn(e, zr),
		logLevel: O(e, Wr),
		minimumLogLevel: O(e, Gr),
		stackFrame: O(e, Hr),
		runtimeMetrics: Fn(e, Vr),
		maxOpsBeforeYield: O(e, Lr),
		preventYield: O(e, Rr)
	};
}, si = {
	[E](e, t) {
		return mi(t._interruptedCause);
	},
	[ut](e, t) {
		return mi(t._interruptedCause);
	}
}, ci = 32, li = { interruptChildren: void 0 }, ui = (e) => {
	if (!e.cache.stackFrame) return;
	let t = /* @__PURE__ */ new Map();
	return t.set(Bt.key, e.cache.stackFrame), Tn(t);
}, di = (e) => wi((t) => {
	let n = e[Symbol.iterator](), r = [], i;
	function a() {
		let e = n.next();
		for (; !e.done;) if (e.value._exit) r.push(e.value._exit), e = n.next();
		else {
			i = e.value.addObserver((e) => {
				r.push(e), a();
			});
			return;
		}
		t(pi(r));
	}
	return a(), gi(() => i?.());
}), fi = (e) => Wt((t) => {
	let n = ui(t), r = Gn();
	for (let i of e) i.interruptUnsafe(t.id, n), r.push(i);
	return Li(di(r));
}), pi = D, mi = Vt, hi = Ht, gi = /*#__PURE__*/ Lt({
	op: "Sync",
	[T](e) {
		let t = this[w], n = t(), r = e.getCont(E);
		return r ? r[E](n, e) : e.yieldWith(D(n));
	}
}), _i = /*#__PURE__*/ Lt({
	op: "Suspend",
	[T](e) {
		let t = this[w];
		return t();
	}
}), vi = /*#__PURE__*/ (/* @__PURE__ */ Lt({
	op: "Yield",
	[T](e) {
		let t = !1;
		return e.currentDispatcher.scheduleTask(() => {
			t || e.evaluate(Ui);
		}, this["~effect/Effect/args"] ?? 0), e.yieldWith(() => {
			t = !0;
		});
	}
}))(0), yi = (e) => _i(() => mi(e())), bi = (e) => Ut(e), xi = /*#__PURE__*/ pi(void 0), Si = /*#__PURE__*/ function() {
	let e = /*#__PURE__*/ It({
		op: "Async",
		[T](e) {
			let t = !1, n = !1, r = this.withSignal ? new AbortController() : void 0, i = this.register.call(e.cache.scheduler, (r) => {
				t || (t = !0, n ? e.evaluate(r) : n = r);
			}, r?.signal);
			return n === !1 ? (n = !0, e.yieldWith(() => {
				t = !0;
			}), r === void 0 && i === void 0 || e._stack.push(Ci(() => (t = !0, r?.abort(), i ?? Ui))), ft) : n;
		}
	}), t = function(e, t) {
		this.register = e, this.withSignal = t;
	};
	return t.prototype = e, function(e, n) {
		return new t(e, n);
	};
}(), Ci = /*#__PURE__*/ Lt({
	op: "AsyncFinalizer",
	[dt](e) {
		e.interruptible && (e.interruptible = !1, e._stack.push(Qi));
	},
	[ut](e, t) {
		return Zr(e) ? Ri(Xi(Vt(e), this[w]()), () => mi(e)) : mi(e);
	}
}), wi = (e) => Si(e, e.length >= 2), Ti = (e, t) => typeof e == "function" ? e : t.shift().bind(e.self), Ei = (e, t) => Object.defineProperty(t, "length", {
	value: e,
	configurable: !0
}), Di = (e, ...t) => {
	let n = Ti(e, t);
	return Ei(n.length, t.length === 0 ? function() {
		return Oi(() => n.apply(this, arguments));
	} : function() {
		let e = Oi(() => n.apply(this, arguments));
		for (let n of t) e = n(e, ...arguments);
		return e;
	});
}, Oi = (e) => {
	try {
		let t = e(), n;
		for (;;) {
			let r = t.next(n);
			if (r.done) return pi(r.value);
			let i = r.value;
			if (i && i._tag === "Success") n = i.value;
			else {
				if (i && i._tag === "Failure") return r.value;
				{
					let n = !0;
					return _i(() => n ? (n = !1, Ri(r.value, (e) => ki(t, e))) : _i(() => ki(e())));
				}
			}
		}
	} catch (e) {
		return bi(e);
	}
}, ki = /*#__PURE__*/ function() {
	let e = /*#__PURE__*/ It({
		op: "Iterator",
		[E](e, t) {
			let n = this.iterator;
			for (;;) {
				let r = n.next(e);
				if (r.done) return pi(r.value);
				if (!A(r.value)) return t._stack.push(this), r.value;
				if (r.value._tag === "Failure") return r.value;
				e = r.value.value;
			}
		},
		[T](e) {
			return this[E](this.initial, e);
		}
	}), t = function(e, t) {
		this.iterator = e, this.initial = t;
	};
	return t.prototype = e, function(e, n) {
		return new t(e, n);
	};
}(), Ai = function(e) {
	return e._stack.push(this), this[w];
}, ji = /*#__PURE__*/ It({
	op: "OnSuccess",
	[T]: Ai
}), Mi = function(e, t, n) {
	this[w] = e, this[E] = t, this.payload = n;
};
Mi.prototype = ji;
var Ni = function() {
	return this.payload;
}, Pi = /*#__PURE__*/ (() => {
	let e = /*#__PURE__*/ et();
	if (e === 0) return !1;
	let t = "~effect/Effect/stackProbe", n = { [t]: function() {
		return /* @__PURE__ */ Error();
	} };
	tt(1);
	let r = /*#__PURE__*/ n[t]();
	return tt(e), r.stack?.includes("[as " + t + "]") === !0;
})(), Fi = function(e, t) {
	let n = this.payload;
	return t.succeedWith(Pi ? n(e) : rt(() => n(e)));
}, Ii = function(e) {
	let t = this.payload;
	return t(e);
}, Li = (e) => new Mi(e, Ni, Ui), Ri = /*#__PURE__*/ r(2, (e, t) => new Mi(e, Ii, t)), A = (e) => e[st] !== void 0, zi = /*#__PURE__*/ r(2, (e, t) => A(e) ? e._tag === "Success" ? t(e.value) : e : Ri(e, t)), Bi = /*#__PURE__*/ r(2, (e, t) => new Mi(e, Fi, t)), Vi = /*#__PURE__*/ r(2, (e, t) => A(e) ? Wi(e, t) : Bi(e, t)), Hi = (e) => e._tag === "Success", Ui = /*#__PURE__*/ D(void 0), Wi = /*#__PURE__*/ r(2, (e, t) => e._tag === "Success" ? D(t(e.value)) : e), Gi = /*#__PURE__*/ r(2, (e, t) => new qi(e, t.length === 1 ? t : (e) => t(e))), Ki = /*#__PURE__*/ It({
	op: "OnFailure",
	[T]: Ai
}), qi = function(e, t) {
	this[w] = e, this[ut] = t;
};
qi.prototype = Ki;
var Ji = (e) => A(e) ? D(e) : Yi(e), Yi = /*#__PURE__*/ Lt({
	op: "Exit",
	[T](e) {
		return e._stack.push(this), this[w];
	},
	[E](e, t, n) {
		return t.succeedWith(n ?? D(e));
	},
	[ut](e, t, n) {
		return t.succeedWith(n ?? Vt(e));
	}
}), Xi = (e, t) => Hi(e) ? t : Gi(t, (t) => mi(Xr(Et(e.cause, t)))), Zi = (e) => Wt((t) => (t.interruptible && (t.interruptible = !1, t._stack.push(Qi)), e)), Qi = /*#__PURE__*/ (/* @__PURE__ */ Lt({
	op: "SetInterruptible",
	[dt](e) {
		if (e.interruptible = this[w], e._interruptedCause && e.interruptible) return () => mi(e._interruptedCause);
	}
}))(!0), $i = (e) => e === "unbounded" ? Infinity : Math.max(1, e ?? 1), ea = () => (e) => {
	let t = e.onItem, n = e.step, r = (e, t, r, a, o) => Ri(Ji(o), (o) => n(e, t[r], o, r) ?? i(e, t, r + 1, a) ?? xi), i = (e, i, a = 0, o = i.length) => {
		for (; a < o; a++) {
			let s = i[a], c = t(e, s, a);
			if (!A(c)) return r(e, i, a, o, c);
			let l = n(e, s, c, a);
			if (l) return l._tag === "Failure" ? l : void 0;
		}
	};
	return i;
}, ta = (e) => {
	let t = e.onItem, n = e.step;
	return (e, r, i) => {
		let a = 0, o = i.end ?? r.length, s = i.concurrency, c = !1, l, u, d, f, p, m = (e) => {
			let t = Ut(e);
			return f = t, c = !0, u && u.size > 0 ? Ri(Zi(fi(Array.from(u))), () => f ?? t) : t;
		}, ee = () => {
			let i = !1;
			for (; !f && a < o; a++) {
				let o = r[a], te = p ?? t(e, o, a);
				if (A(te)) {
					if (f = n(e, o, te, a), f) break;
				} else if (l) {
					p = void 0;
					let t = ra(l, te, !0, !0, "inherit");
					if (t._exit) {
						if (f = n(e, o, t._exit, a), f) break;
						continue;
					}
					u.add(t);
					let r = a;
					if (t.addObserver((a) => {
						u.delete(t);
						try {
							if (f) {
								if (a._tag === "Failure") {
									let e = a.cause.reasons.filter((e) => e._tag !== "Interrupt");
									if (e.length > 0) {
										let t = wt(e);
										f = Vt(f._tag === "Failure" ? Xr(Et(f.cause, t)) : t);
									}
								}
							} else {
								let t = n(e, o, a, r);
								t && (f = t, ee());
							}
							if (i) {
								let e = ee();
								e && d(e);
							} else c && u.size === 0 && d(f ?? xi);
						} catch (e) {
							d(m(e));
						}
					}), u.size < s) continue;
					i = !0, a++;
					return;
				} else return wi((e) => {
					l = ii(), u = /* @__PURE__ */ new Set(), p = te, d = e;
					let t;
					try {
						t = ee();
					} catch (t) {
						return e(m(t));
					}
					return t ? e(t) : _i(() => (f ??= Ui, Ri(u ? fi(u) : xi, () => f?._tag === "Failure" ? f : xi)));
				});
			}
			if (c = !0, f) {
				if (u && u.size > 0) {
					let e = ui(l);
					u.forEach((t) => t.interruptUnsafe(l.id, e));
					return;
				}
				if (d || f._tag === "Failure") return f;
			} else if (d) {
				if (u) u.size === 0 && d(xi);
				else return Ui;
			}
		};
		return ee();
	};
}, na = () => (e) => ta(e), ra = (e, t, n = !1, r = !1, i = !1) => {
	let a = e, o = i === "inherit" ? a.interruptible : !i, s = new ai(a.context, o);
	return r || (a.children().add(s), s._parent = a), n ? s.evaluate(t) : (s._asyncContext = ri(), a.currentDispatcher.scheduleTask(() => s.evaluate(t), 0)), s;
}, ia = (e) => (t, n) => {
	let r = new ai(n?.scheduler ? Nn(e, Ar, n.scheduler) : e, n?.uninterruptible !== !0);
	if (r.evaluate(t), r._exit) return r;
	if (n?.signal) {
		if (n.signal.aborted) r.interruptUnsafe();
		else {
			let e = () => r.interruptUnsafe();
			n.signal.addEventListener("abort", e, { once: !0 }), r.addObserver(() => n.signal.removeEventListener("abort", e));
		}
	}
	return n?.onFiberStart && n.onFiberStart(r), r;
}, aa = /*#__PURE__*/ ((e) => {
	let t = ia(e);
	return (e) => {
		if (A(e)) return e;
		let n = new Fr("sync"), r = t(e, { scheduler: n });
		return r._dispatcher?.flush(), r._exit ?? Ut(new sa(r));
	};
})(/*#__PURE__*/ An()), oa = "~effect/Cause/AsyncFiberError", sa = class extends (/*#__PURE__*/ qt("AsyncFiberError")) {
	[oa] = oa;
	constructor(e) {
		super({
			message: "An asynchronous Effect was executed with Effect.runSync",
			fiber: e
		});
	}
}, ca = {
	bold: "1",
	red: "31",
	green: "32",
	yellow: "33",
	blue: "34",
	cyan: "36",
	white: "37",
	gray: "90",
	black: "30",
	bgBrightRed: "101"
};
ca.gray, ca.blue, ca.green, ca.yellow, ca.red, ca.bgBrightRed, ca.black;
// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Cause.js
var la = Mt, ua = At, da = Qr, fa = D, pa = Vt, ma = Ht, ha = Ui, ga = Hi, _a = "~effect/DateTime", va = "~effect/DateTime/TimeZone", ya = {
	[_a]: _a,
	pipe() {
		return e(this, arguments);
	},
	[Ze]() {
		return this.toString();
	},
	toJSON() {
		return Oa(this).toJSON();
	}
}, ba = {
	...ya,
	_tag: "Utc",
	[g]() {
		return me(this.epochMilliseconds);
	},
	[b](e) {
		return Da(e) && e._tag === "Utc" && this.epochMilliseconds === e.epochMilliseconds;
	},
	toString() {
		return `DateTime.Utc(${Oa(this).toJSON()})`;
	}
}, xa = {
	...ya,
	_tag: "Zoned",
	[g]() {
		return v(me(this.epochMilliseconds))(_(this.zone));
	},
	[b](e) {
		return Da(e) && e._tag === "Zoned" && this.epochMilliseconds === e.epochMilliseconds && x(this.zone, e.zone);
	},
	toString() {
		return `DateTime.Zoned(${Fa(this)})`;
	}
}, Sa = {
	[va]: va,
	[Ze]() {
		return this.toString();
	}
};
({ ...Sa }), { ...Sa };
var Ca = {
	value: void 0,
	enumerable: !1,
	writable: !0
}, wa = /*#__PURE__*/ new WeakMap(), Ta = (e, t) => ({
	get() {
		return Object.isExtensible(this) ? void 0 : wa.get(this)?.[e];
	},
	set(n) {
		if (Object.isExtensible(this)) {
			for (let e of t) Object.defineProperty(this, e, Ca);
			this[e] = n;
		} else {
			let t = wa.get(this);
			t === void 0 && (t = {}, wa.set(this, t)), t[e] = n;
		}
	}
}), Ea = [
	"partsUtc",
	"adjustedEpochMilliseconds",
	"partsAdjusted"
];
Object.defineProperty(ba, "partsUtc", Ta("partsUtc", ["partsUtc"])), Object.defineProperties(xa, {
	partsUtc: Ta("partsUtc", Ea),
	adjustedEpochMilliseconds: Ta("adjustedEpochMilliseconds", Ea),
	partsAdjusted: Ta("partsAdjusted", Ea)
});
var Da = (e) => h(e, _a), Oa = (e) => new Date(e.epochMilliseconds), ka = (e) => {
	if (e._tag === "Utc") return new Date(e.epochMilliseconds);
	if (e.zone._tag === "Offset") return new Date(e.epochMilliseconds + e.zone.offset);
	if (e.adjustedEpochMilliseconds !== void 0) return new Date(e.adjustedEpochMilliseconds);
	let t = !1, n = e.zone.format.formatToParts(e.epochMilliseconds).filter((e) => e.type === "era" ? (t = e.value === "BC", !1) : e.type !== "literal"), r = Number(n[2].value), i = /* @__PURE__ */ new Date(0);
	return i.setUTCFullYear(t ? 1 - r : r, Number(n[0].value) - 1, Number(n[1].value)), i.setUTCHours(Number(n[3].value), Number(n[4].value), Number(n[5].value), n[6]?.type === "fractionalSecond" ? Number(n[6].value) : (e.epochMilliseconds % 1e3 + 1e3) % 1e3), e.adjustedEpochMilliseconds = i.getTime(), i;
}, Aa = (e) => ka(e).getTime() - Na(e), ja = (e) => {
	let t = Math.abs(e), n = Math.floor(t / 36e5), r = Math.round(t % 36e5 / 6e4);
	return r === 60 && (n += 1, r = 0), `${e < 0 ? "-" : "+"}${String(n).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}, Ma = (e) => ja(Aa(e)), Na = (e) => e.epochMilliseconds, Pa = (e) => {
	let t = ka(e);
	return e._tag === "Utc" ? t.toISOString() : `${t.toISOString().slice(0, -1)}${Ma(e)}`;
}, Fa = (e) => e.zone._tag === "Offset" ? Pa(e) : `${Pa(e)}[${e.zone.id}]`, Ia = pi, La = _i, j = hi, Ra = yi, za = bi, Ba = Ri, Va = Ji, Ha = Gi, Ua = aa, Wa = Vi, M = zi, Ga = Di, Ka = "~effect/BigDecimal", qa = {
	[Ka]: Ka,
	[g]() {
		let e = eo(this);
		return v(y(String(e.value)), me(e.scale));
	},
	[b](e) {
		return Ja(e) && oo(this, e) === 0;
	},
	toString() {
		return `BigDecimal(${co(this)})`;
	},
	toJSON() {
		return {
			_id: "BigDecimal",
			value: String(this.value),
			scale: this.scale
		};
	},
	[Ze]() {
		return this.toJSON();
	},
	pipe() {
		return e(this, arguments);
	}
}, Ja = (e) => h(e, Ka), Ya = (e, t) => {
	if (!Number.isSafeInteger(t)) throw RangeError(`Scale must be a safe integer, got ${t}`);
	let n = Object.create(qa);
	return n.value = e, n.scale = t, n;
}, Xa = (e, t) => {
	let n = Ya(e, t);
	return n.normalized = n, n;
}, N = /*#__PURE__*/ BigInt(0), Za = /*#__PURE__*/ BigInt(1), Qa = /*#__PURE__*/ BigInt(10), $a = /*#__PURE__*/ Xa(N, 0), eo = (e) => {
	if (e.normalized === void 0) {
		if (e.value === N) e.normalized = $a;
		else {
			let t = `${e.value}`, n = to(t);
			e.normalized = Xa(BigInt(t.slice(0, t.length - n)), e.scale - n);
		}
	}
	return e.normalized;
}, to = (e) => {
	let t = e.length;
	for (; e[t - 1] === "0";) t--;
	return e.length - t;
}, no = 100, ro = [Za], io = (e, t) => e === t ? 0 : e < t ? -1 : 1, ao = (e, t) => {
	let n = `${e.value < N ? -e.value : e.value}`, r = `${t.value < N ? -t.value : t.value}`, i = BigInt(n.length - r.length) - BigInt(e.scale) + BigInt(t.scale);
	if (i !== N) return i < N ? -1 : 1;
	let a = Math.max(n.length, r.length);
	return un(n.padEnd(a, "0"), r.padEnd(a, "0"));
}, oo = (e, t) => {
	if (e.scale === t.scale) return io(e.value, t.value);
	let n = so(e), r = so(t);
	if (n !== r) return n < r ? -1 : 1;
	if (n === 0) return 0;
	let i = e.scale - t.scale, a = Math.abs(i);
	if (a > no) return n === -1 ? ao(t, e) : ao(e, t);
	let o = ro[a] ??= Qa ** BigInt(a);
	return i > 0 ? io(e.value, t.value * o) : io(e.value * o, t.value);
}, so = (e) => e.value === N ? 0 : e.value < N ? -1 : 1, co = (e) => {
	let t = eo(e);
	if (Math.abs(t.scale) >= 16) return lo(t);
	let n = t.value < N, r = `${n ? -t.value : t.value}`, i = t.scale > 0 ? r.padStart(t.scale + 1, "0") : r.padEnd(r.length - t.scale, "0"), a = i.length - t.scale, o = t.scale > 0 ? `${i.slice(0, a)}.${i.slice(a)}` : i;
	return n ? `-${o}` : o;
}, lo = (e) => {
	if (uo(e)) return "0e+0";
	let t = eo(e), n = `${t.value}`, r = t.value < N ? 2 : 1, i = n.slice(0, r), a = n.slice(r), o = a.length - t.scale;
	return `${i}${a === "" ? "" : `.${a}`}e${o >= 0 ? "+" : ""}${o}`;
}, uo = (e) => e.value === N, fo = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", po = /*#__PURE__*/ (/* @__PURE__ */ new Uint8Array(123)).fill(255);
for (let e = 0; e < 64; e++) po[/*#__PURE__*/ fo.charCodeAt(e)] = e;
po[61] = 0, { ...C }, { ...C }, { ...pt }, C.toString, C[Ze], { ...pt };
var mo = "~sentinels", ho = "~constructor", P = /*#__PURE__*/ Symbol(), F = fa, I = /*#__PURE__*/ F(P), L = /*#__PURE__*/ F(P), go = (e) => e === P ? dn() : fn(e), _o = (e) => e._tag === "None" ? I : F(e.value), vo = "~effect/SchemaIssue/Issue";
function yo(e) {
	return h(e, vo) && e[vo] === vo;
}
var R = class {
	[vo] = vo;
	constructor(e, t) {
		t?.reportInput === !0 && e !== P && (this.input = e);
	}
}, bo = class extends R {
	_tag = "Filter";
	filter;
	issue;
	constructor(e, t, n, r) {
		super(n, r), this.filter = e, this.issue = t;
	}
}, xo = class extends R {
	_tag = "Encoding";
	ast;
	issue;
	constructor(e, t, n, r) {
		super(n, r), this.ast = e, this.issue = t;
	}
}, So = class extends R {
	_tag = "Pointer";
	path;
	issue;
	constructor(e, t) {
		super(), this.path = e, this.issue = t;
	}
}, Co = class extends R {
	_tag = "MissingKey";
	annotations;
	constructor(e) {
		super(), this.annotations = e;
	}
}, wo = class extends R {
	_tag = "UnexpectedKey";
	ast;
	constructor(e, t, n) {
		super(t, n), this.ast = e;
	}
}, z = class extends R {
	_tag = "Composite";
	ast;
	issues;
	constructor(e, t, n, r) {
		super(n, r), this.ast = e, this.issues = t;
	}
}, To = class extends R {
	_tag = "InvalidType";
	ast;
	constructor(e, t, n) {
		super(t, n), this.ast = e;
	}
}, Eo = class extends R {
	_tag = "InvalidValue";
	annotations;
	constructor(e, t, n) {
		super(t, n), this.annotations = e;
	}
}, Do = class extends R {
	_tag = "AnyOf";
	ast;
	issues;
	constructor(e, t, n, r) {
		super(n, r), this.ast = e, this.issues = t;
	}
}, Oo = class extends R {
	_tag = "OneOf";
	ast;
	successes;
	constructor(e, t, n, r) {
		super(n, r), this.ast = e, this.successes = t;
	}
};
function ko(e, t, n) {
	if (yo(e)) return e;
	if (typeof e == "string") return new Eo({ message: e }, t, n);
	let r = typeof e.issue == "string" ? new Eo({ message: e.issue }, t, n) : e.issue;
	return new So(e.path, r);
}
function Ao(e, t, n) {
	if (e !== void 0) return typeof e == "boolean" ? e ? void 0 : new Eo(void 0, t, n) : ko(e, t, n);
}
function jo(e, t, n, r) {
	return Array.isArray(t) ? Wn(t) ? t.length === 1 ? ko(t[0], n, r) : new z(e, Kn(t, (e) => ko(e, n, r)), n, r) : void 0 : Ao(t, n, r);
}
// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/schema/cause.js
function Mo(e) {
	let t;
	for (let n of e.reasons) {
		if (!la(n) || !yo(n.error)) return;
		t ??= n.error;
	}
	return t;
}
function No(e, t) {
	let n = Mo(e);
	if (n === void 0) throw Error(t, { cause: e });
	return n;
}
// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/SchemaGetter.js
var Po = (e) => Object.assign(Object.create(t), e), Fo = /*#__PURE__*/ Po({ _tag: "Passthrough" });
function Io() {
	return Fo;
}
function Lo(e) {
	return Po({
		_tag: "Transform",
		transform: e
	});
}
function Ro() {
	return Lo(globalThis.String);
}
function zo() {
	return Lo(globalThis.Number);
}
// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/SchemaTransformation.js
var Bo = class extends n {
	_tag = "Middleware";
	decode;
	encode;
	constructor(e, t) {
		super(), this.decode = e, this.encode = t;
	}
	flip() {
		return new Bo(this.encode, this.decode);
	}
}, Vo = "~effect/SchemaTransformation/Transformation", Ho = class extends n {
	[Vo] = Vo;
	_tag = "Transformation";
	decode;
	encode;
	constructor(e, t) {
		super(), this.decode = e, this.encode = t;
	}
	flip() {
		return new Ho(this.encode, this.decode);
	}
};
function Uo(e) {
	return h(e, Vo) && e[Vo] === Vo;
}
var Wo = (e) => Uo(e) ? e : new Ho(e.decode, e.encode);
function Go(e) {
	return new Ho(Lo(e.decode), Lo(e.encode));
}
var Ko = /*#__PURE__*/ new Ho(/*#__PURE__*/ Io(), /*#__PURE__*/ Io());
function qo() {
	return Ko;
}
var Jo = /*#__PURE__*/ new Ho(/*#__PURE__*/ zo(), /*#__PURE__*/ Ro());
// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/SchemaAST.js
function Yo(e) {
	return (t) => t._tag === e;
}
var Xo = /*#__PURE__*/ Yo("Declaration"), Zo = /*#__PURE__*/ Yo("Never"), Qo = /*#__PURE__*/ Yo("Literal"), $o = /*#__PURE__*/ Yo("UniqueSymbol"), es = /*#__PURE__*/ Yo("Arrays"), ts = /*#__PURE__*/ Yo("Objects"), ns = /*#__PURE__*/ Yo("Suspend"), rs = class {
	to;
	transformation;
	constructor(e, t) {
		this.to = e, this.transformation = t;
	}
}, is = {}, as = class {
	isOptional;
	isMutable;
	constructorDefault;
	annotations;
	constructor(e, t, n = void 0, r = void 0) {
		this.isOptional = e, this.isMutable = t, this.constructorDefault = n, this.annotations = r;
	}
}, os = "~effect/Schema", ss = class {
	[os] = os;
	annotations;
	checks;
	encoding;
	context;
	constructor(e = void 0, t = void 0, n = void 0, r = void 0) {
		this.annotations = e, this.checks = t, this.encoding = n, this.context = r;
	}
	toString() {
		return `<${this._tag}>`;
	}
}, cs = class extends ss {
	_tag = "Declaration";
	typeParameters;
	run;
	encodingChecks;
	encodingRun;
	constructor(e, t, n, r, i, a, o, s) {
		super(n, r, i, a), this.typeParameters = e, this.run = t, this.encodingChecks = o, this.encodingRun = s;
	}
	getParser() {
		let e;
		return (t, n) => {
			if (t === P) return I;
			e ??= this.run(this.typeParameters);
			try {
				return e(t, this, n);
			} catch (e) {
				return za(e);
			}
		};
	}
	_rebuild(e, t, n, r, i) {
		let a = bc(this.typeParameters, e);
		return a === this.typeParameters && t === this.checks && n === this.encodingChecks && r === this.run && i === this.encodingRun ? this : new cs(a, r, this.annotations, t, void 0, this.context, n, i);
	}
	recur(e) {
		return this._rebuild(e, this.checks, this.encodingChecks, this.run, this.encodingRun);
	}
	flip(e) {
		return this._rebuild(e, this.encodingChecks, this.checks, this.encodingRun ?? this.run, this.run);
	}
	getExpected() {
		let e = this.annotations?.expected;
		return typeof e == "string" ? e : "<Declaration>";
	}
}, ls = /*#__PURE__*/ new class extends ss {
	_tag = "Unknown";
	getParser() {
		return Mc(this, se);
	}
	getExpected() {
		return "unknown";
	}
}(), us = class extends ss {
	_tag = "Literal";
	literal;
	constructor(e, t, n, r, i) {
		if (super(t, n, r, i), typeof e == "number" && !globalThis.Number.isFinite(e)) throw Error(`A numeric literal must be finite, got ${S(e)}`);
		this.literal = e;
	}
	getParser() {
		return jc(this, this.literal);
	}
	matchPart(e, t) {
		return e === globalThis.String(this.literal) ? this.literal : void 0;
	}
	toCodecJson() {
		return typeof this.literal == "bigint" ? ds(this) : this;
	}
	toCodecStringTree() {
		return typeof this.literal == "string" ? this : ds(this);
	}
	getExpected() {
		return typeof this.literal == "string" ? JSON.stringify(this.literal) : globalThis.String(this.literal);
	}
};
function ds(e) {
	let t = globalThis.String(e.literal);
	return uc(e, [new rs(new us(t), new Ho(Lo(() => e.literal), Lo(() => t)))]);
}
var fs = /*#__PURE__*/ new class extends ss {
	_tag = "String";
	getParser() {
		return Mc(this, re);
	}
	matchPart(e, t) {
		let n = this.checks;
		return n && !t.disableChecks && Bc(n, e, void 0, this, t) ? void 0 : e;
	}
	getExpected() {
		return "string";
	}
}(), ps = class extends ss {
	_tag = "Number";
	getParser() {
		return Mc(this, ie);
	}
	matchKey(e, t) {
		return this._match(Fc, e, t);
	}
	matchPart(e, t) {
		return this._match(Pc, e, t);
	}
	_match(e, t, n) {
		if (!e.test(t)) return;
		let r = globalThis.Number(t);
		return n.disableChecks || !this.checks ? r : Bc(this.checks, r, void 0, this, n) ? void 0 : r;
	}
	toCodecJson() {
		return this.checks && (ms(this.checks, "effect/schema/isFinite") || ms(this.checks, "effect/schema/isInt")) ? this : uc(this, [ac]);
	}
	toCodecStringTree() {
		return this.toCodecJson() === this ? uc(this, [Rc]) : uc(this, [zc]);
	}
	getExpected() {
		return "number";
	}
};
function ms(e, t) {
	return e.some((e) => e.annotations?.representation?.id === t || e._tag === "FilterGroup" && ms(e.checks, t));
}
var hs = /*#__PURE__*/ new ps(), gs = class extends ss {
	_tag = "Arrays";
	isMutable;
	elements;
	rest;
	encodingChecks;
	constructor(e, t, n, r, i, a, o, s) {
		super(r, i, a, o), this.isMutable = e, this.elements = t, this.rest = n, this.encodingChecks = s;
		let c = !1;
		for (let e = 0; e < t.length; e++) if (Cc(t[e])) c = !0;
		else if (c) throw Error("A required element cannot follow an optional element. ts(1257)");
		if (c && n.length > 1) throw Error("A required element cannot follow an optional element. ts(1257)");
		for (let e = 1; e < n.length; e++) if (Cc(n[e])) throw Error("An optional element cannot follow a rest element. ts(1266)");
	}
	getParser(e, t = e) {
		let n = this, r, i, a = n.elements.length, o = Math.max(0, n.rest.length - 1);
		function s(e, t) {
			return t < a ? r[t] : t >= e ? i[t - e + 1] : i[0];
		}
		let c = (e) => {
			let { input: t, len: r, options: i } = e;
			if (n.rest.length === 0 && r > a) for (let o = a; o < r; o++) {
				let r = new wo(n, t[o], i), a = new So([o], r);
				if (i.errors === "all") e.issues ? e.issues.push(a) : e.issues = [a];
				else return j(new z(n, [a], t, i));
			}
			return e.issues ? j(new z(n, e.issues, t, i)) : F(e.output);
		}, l = (e, t) => {
			let r = e.length, i = {
				ast: n,
				getParser: s,
				input: e,
				len: r,
				tailThreshold: Math.max(a, r - o),
				output: [],
				issues: void 0,
				options: t
			}, u = n.rest.length === 0 ? a : Math.max(r, a + o), d = t.concurrency === void 0 ? 1 : $i(t.concurrency), f = d === 1 ? ys(i, e, 0, u) : bs(i, e, {
				concurrency: d,
				end: u
			});
			if (!f) return c(i);
			if (A(f)) return M(f, () => c(i));
			let p = !0;
			return La(() => p ? (p = !1, Ba(f, () => c(i))) : l(e, t));
		};
		return (e, a) => {
			if (e === P) return I;
			try {
				return Array.isArray(e) ? (r || (r = n.elements.map((e) => ({
					ast: e,
					parser: t(e)
				})), i = n.rest.map((e) => ({
					ast: e,
					parser: t(e)
				}))), l(e, a)) : j(new To(n, e, a));
			} catch (e) {
				return za(e);
			}
		};
	}
	_rebuild(e, t, n) {
		let r = bc(this.elements, e), i = bc(this.rest, e);
		return r === this.elements && i === this.rest && t === this.checks && n === this.encodingChecks ? this : new gs(this.isMutable, r, i, this.annotations, t, void 0, this.context, n);
	}
	recur(e) {
		return this._rebuild(e, this.checks, this.encodingChecks);
	}
	flip(e) {
		return this._rebuild(e, this.encodingChecks, this.checks);
	}
	getExpected() {
		return "array";
	}
};
function _s(e, t, n, r) {
	if (n._tag === "Failure") return xs(e, e.ast, r, n);
	let i = n === L ? t : n[w];
	if (i !== P) e.output[r] = i;
	else {
		let t = e.getParser(e.tailThreshold, r);
		if (Cc(t.ast)) return;
		let n = new So([r], new Co(t.ast.context?.annotations));
		if (e.options.errors === "all") e.issues ? e.issues.push(n) : e.issues = [n];
		else return ma(new z(e.ast, [n], e.input, e.options));
	}
}
var vs = {
	onItem(e, t, n) {
		let r = n < e.len ? t : P;
		return e.getParser(e.tailThreshold, n).parser(r, e.options);
	},
	step: _s
}, ys = /*#__PURE__*/ ea()(vs), bs = /*#__PURE__*/ na()(vs), xs = (e, t, n, r) => {
	if (r.cause.reasons.length === 0) return r;
	let i = Mo(r.cause);
	if (i === void 0) return pa(da(r.cause, (r) => new z(t, [new So([n], r)], e.input, e.options)));
	let a = new So([n], i);
	if (e.options.errors === "all") e.issues ? e.issues.push(a) : e.issues = [a];
	else return ma(new z(t, [a], e.input, e.options));
}, Ss = "[+-]?(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[Ee][+-]?\\d+)?";
function Cs(e, t, n = is) {
	let r, i;
	function a(t) {
		switch (t._tag) {
			case "String":
			case "TemplateLiteral": return (r ??= Object.keys(e)).filter((e) => t.matchPart(e, n) !== void 0);
			case "Number": return (r ??= Object.keys(e)).filter((e) => t.matchKey(e, n) !== void 0);
			case "Symbol": return (i ??= Object.getOwnPropertySymbols(e)).filter((r) => Object.prototype.propertyIsEnumerable.call(e, r) && t.matchKey(r, n) !== void 0);
			case "Union": return [...new Set(t.types.flatMap(a))];
			default: return [];
		}
	}
	return a(Nc(Oc(t)));
}
var ws = class {
	name;
	type;
	constructor(e, t) {
		this.name = e, this.type = t;
	}
};
function Ts(e) {
	switch (e._tag) {
		case "String":
		case "Number":
		case "Symbol":
		case "TemplateLiteral": return !0;
		case "Union": return e.types.every(Ts);
		default: return !1;
	}
}
function Es(e) {
	let t = fc(e);
	switch (t._tag) {
		case "String":
		case "Number":
		case "Symbol":
		case "TemplateLiteral": return !0;
		case "Union": return t.types.every(Es);
		default: return !1;
	}
}
function Ds(e) {
	return Ts(e) && Es(e);
}
var Os = class {
	parameter;
	type;
	constructor(e, t) {
		if (!Ds(e)) throw Error(`Invalid index signature parameter ${e._tag}`);
		if (this.parameter = e, this.type = t, Cc(t) || t.encoding !== void 0 && Cc(Oc(t))) throw Error("Cannot use `Schema.optionalKey` or `Schema.optional` with index signatures. Index signatures already allow keys to be absent; use `Schema.UndefinedOr` to allow `undefined` values.");
	}
}, ks = class extends ss {
	_tag = "Objects";
	propertySignatures;
	indexSignatures;
	encodingChecks;
	constructor(e, t, n, r, i, a, o) {
		super(n, r, i, a), this.propertySignatures = e, this.indexSignatures = t, this.encodingChecks = o;
	}
	getParser(e, t = e) {
		let n = this, r = n.propertySignatures.length, i = n.indexSignatures.length;
		if (!r && !i) return Mc(n, oe);
		let a, o, s = () => (a || (a = n.propertySignatures.map((e) => ({
			parser: t(e.type),
			name: e.name,
			type: e.type
		})), o = i ? n.indexSignatures.map((n) => ({
			is: n,
			parserKey: e(Nc(n.parameter)),
			parserValue: t(n.type)
		})) : void 0), a), c = () => {
			let e = new Set(n.propertySignatures.map((e) => typeof e.name == "number" ? globalThis.String(e.name) : e.name)), t = (t, i, a, o, s) => {
				if (s._tag === "Failure") return xs(t, n, i, s) ?? ha;
				let c = s === L ? o : s[w];
				if (a !== P && c !== P) {
					if (r && (e.has(i) || e.has(typeof a == "number" ? globalThis.String(a) : a))) return ha;
					it(t.out, a, c);
				}
				return ha;
			}, c = (e, r, i, a) => {
				if (!a) {
					let t = i.parserKey(r, e.options);
					if (!A(t)) return Ba(Va(t), (t) => c(e, r, i, t));
					a = t;
				}
				if (a._tag === "Failure") return xs(e, n, r, a) ?? ha;
				let o = a === L ? r : a[w], s = e.input[r], l = i.parserValue(s, e.options);
				return A(l) ? t(e, r, o, s, l) : Ba(Va(l), (n) => t(e, r, o, s, n));
			}, l = (e, n, r) => {
				let i = e.input[n], a = r.parserValue(i, e.options);
				return A(a) ? t(e, n, n, i, a) : Ba(Va(a), (r) => t(e, n, n, i, r));
			}, u = i ? na()({
				onItem: (e, [t, n]) => n.is.parameter === fs ? l(e, t, n) : c(e, t, n),
				step: (e, t, n) => n._tag === "Failure" ? n : void 0
			}) : void 0;
			return Ga(function* (t, d) {
				if (t === P) return P;
				if (typeof t != "object" || !t || Array.isArray(t)) return yield* j(new To(n, t, d));
				s();
				let f = t, p = {}, m = {
					ast: n,
					input: f,
					out: p,
					issues: void 0,
					options: d
				}, ee = d.errors === "all", te = d.onExcessProperty === "error", ne = d.concurrency === void 0 ? 1 : $i(d.concurrency), re = i && te ? n.indexSignatures.map((e) => Cs(f, e.parameter, d)) : void 0;
				if (te) {
					let r = re ? new Set(e) : e;
					if (re) for (let e of re) for (let t of e) r.add(t);
					let i = Reflect.ownKeys(f);
					for (let e = 0; e < i.length; e++) {
						let a = i[e];
						if (!r.has(a) && Object.prototype.propertyIsEnumerable.call(f, a)) {
							let e = new wo(n, f[a], d), r = new So([a], e);
							if (ee) {
								m.issues ? m.issues.push(r) : m.issues = [r];
								continue;
							}
							return yield* j(new z(n, [r], t, d));
						}
					}
				}
				if (r) {
					let e = ne === 1 ? Ms(m, a) : Ns(m, a, { concurrency: ne });
					e && (yield* e);
				}
				if (i && ne === 1) for (let e = 0; e < i; e++) {
					let t = o[e], n = t.is.parameter === fs ? l : c, r = re?.[e] ?? (t.is.parameter === fs ? Object.keys(f) : Cs(f, t.is.parameter, d));
					for (let e = 0; e < r.length; e++) {
						let i = n(m, r[e], t);
						if (!A(i)) yield* i;
						else if (i._tag === "Failure") return yield* i;
					}
				}
				else if (u) {
					let e = Gn();
					for (let t = 0; t < i; t++) {
						let n = o[t], r = re?.[t] ?? (n.is.parameter === fs ? Object.keys(f) : Cs(f, n.is.parameter, d));
						for (let t = 0; t < r.length; t++) e.push([r[t], n]);
					}
					let t = u(m, e, { concurrency: ne });
					t && (yield* t);
				}
				return m.issues ? yield* j(new z(n, m.issues, t, d)) : p;
			});
		};
		if (i) return c();
		let l, u = (e, t, n) => {
			let r = a[t];
			return Ba(Va(n), (n) => {
				let i = {
					...e,
					out: { ...e.out }
				}, o = As(i, r, n);
				if (o) return o;
				let s = () => F(i.out), c = Ms(i, a.slice(t + 1));
				return c ? M(c, s) : s();
			});
		};
		return (e, t) => {
			if (e === P) return I;
			if (t.errors === "all" || t.onExcessProperty !== void 0 || t.concurrency !== void 0 && $i(t.concurrency) !== 1) return (l ??= c())(e, t);
			if (typeof e != "object" || !e || Array.isArray(e)) return j(new To(n, e, t));
			let r = s(), i = e, a = {}, o = {
				ast: n,
				input: i,
				out: a,
				issues: void 0,
				options: t
			};
			try {
				for (let e = 0; e < r.length; e++) {
					let n = r[e], s = n.name, c = Ws(i, s), l = c ? i[s] : P, d = n.parser(l, t);
					if (!A(d)) return u(o, e, d);
					if (d === L) {
						c && it(a, s, l);
						continue;
					}
					let f = As(o, n, d);
					if (f) return f;
				}
			} catch (e) {
				return za(e);
			}
			return F(a);
		};
	}
	_rebuild(e, t, n, r) {
		let i = bc(this.propertySignatures, (t) => {
			let n = e(t.type);
			return n === t.type ? t : new ws(t.name, n);
		}), a = bc(this.indexSignatures, (n) => {
			let r = t(n.parameter), i = e(n.type);
			return r === n.parameter && i === n.type ? n : new Os(r, i);
		});
		return i === this.propertySignatures && a === this.indexSignatures && n === this.checks && r === this.encodingChecks ? this : new ks(i, a, this.annotations, n, void 0, this.context, r);
	}
	flip(e) {
		return this._rebuild(e, e, this.encodingChecks, this.checks);
	}
	recur(e, t = e) {
		return this._rebuild(e, t, this.checks, this.encodingChecks);
	}
	getExpected() {
		return this.propertySignatures.length === 0 && this.indexSignatures.length === 0 ? "object | array" : "object";
	}
};
function As(e, t, n) {
	if (n._tag === "Failure") return xs(e, e.ast, t.name, n);
	if (n === L) return;
	let r = n[w];
	if (r !== P) it(e.out, t.name, r);
	else if (delete e.out[t.name], !Cc(t.type)) {
		let n = new So([t.name], new Co(t.type.context?.annotations));
		if (e.options.errors === "all") {
			e.issues ? e.issues.push(n) : e.issues = [n];
			return;
		}
		return ma(new z(e.ast, [n], e.input, e.options));
	}
}
var js = {
	onItem(e, t) {
		if (!Ws(e.input, t.name)) return t.parser(P, e.options);
		let n = e.input[t.name];
		return it(e.out, t.name, n), t.parser(n, e.options);
	},
	step: As
}, Ms = /*#__PURE__*/ ea()(js), Ns = /*#__PURE__*/ na()(js);
function Ps(e, t) {
	return e ? t ? [...e, ...t] : e : t;
}
function Fs(e, t, n) {
	return new ks(Reflect.ownKeys(e).map((t) => new ws(t, e[t].ast)), [], n, t);
}
function Is(e) {
	return e.ast;
}
function Ls(e, t, n) {
	return new Ks(e.map(Is), t, void 0, n);
}
var Rs = /*#__PURE__*/ u((e) => {
	for (;;) {
		if (ns(e)) return ls;
		let t = e.encoding;
		if (!t) return e.recur?.(Rs, i) ?? e;
		if (t.some((e) => e.transformation._tag === "Middleware" && e.transformation.decode !== i)) return ls;
		e = t[t.length - 1].to;
	}
});
function zs(e) {
	switch (e._tag) {
		case "Null": return ["null"];
		case "Undefined": return ["undefined"];
		case "String":
		case "TemplateLiteral": return ["string"];
		case "Number": return ["number"];
		case "Boolean": return ["boolean"];
		case "Symbol":
		case "UniqueSymbol": return ["symbol"];
		case "BigInt": return ["bigint"];
		case "Arrays": return ["array"];
		case "ObjectKeyword": return [
			"object",
			"array",
			"function"
		];
		case "Objects": return e.propertySignatures.length || e.indexSignatures.length ? ["object"] : [
			"string",
			"number",
			"boolean",
			"symbol",
			"bigint",
			"object",
			"array",
			"function"
		];
		case "Enum": return Array.from(new Set(e.enums.map(([, e]) => typeof e)));
		case "Literal": return [typeof e.literal];
		case "Union": return Array.from(new Set(e.types.flatMap(zs)));
		default: return [
			"null",
			"undefined",
			"string",
			"number",
			"boolean",
			"symbol",
			"bigint",
			"object",
			"array",
			"function"
		];
	}
}
function Bs(e) {
	switch (e._tag) {
		default: return [];
		case "Declaration": {
			let t = e.annotations?.[mo];
			return Array.isArray(t) ? t : [];
		}
		case "Objects": return e.propertySignatures.flatMap((e) => {
			let t = e.type;
			if (!Cc(t)) {
				if (Qo(t)) return [{
					key: e.name,
					literal: t.literal
				}];
				if ($o(t)) return [{
					key: e.name,
					literal: t.symbol
				}];
			}
			return [];
		});
		case "Arrays": return e.elements.flatMap((e, t) => {
			if (!Cc(e)) {
				if (Qo(e)) return [{
					key: t,
					literal: e.literal
				}];
				if ($o(e)) return [{
					key: t,
					literal: e.symbol
				}];
			}
			return [];
		});
		case "Union": {
			if (e.types.length === 0) return [];
			let t = e.types.map((e) => Bs(Rs(e)));
			return t[0].filter((e) => t.every((t) => t.some((t) => t.key === e.key && t.literal === e.literal)));
		}
		case "Suspend": return Bs(e.thunk());
	}
}
var Vs = /*#__PURE__*/ new WeakMap(), Hs = /*#__PURE__*/ Object.freeze([]), Us = (e) => e === null ? "null" : Array.isArray(e) ? "array" : typeof e, Ws = (e, t) => t === "__proto__" ? Object.hasOwn(e, t) : t in e;
function Gs(e) {
	let t = Vs.get(e);
	if (t) return t;
	let n, r = 0, i, a, o = !0, s = [];
	for (let t = 0; t < e.length; t++) {
		let c = e[t], l = Rs(c);
		if (Zo(l)) continue;
		if (Qo(l) || $o(l)) {
			a ??= /* @__PURE__ */ new Map();
			let e = Qo(l) ? l.literal : l.symbol;
			s[t] = e;
			let n = a.get(e);
			n || a.set(e, n = []), n.push(t);
		} else o = !1;
		let u = Bs(l);
		if (u.length) {
			n ??= /* @__PURE__ */ new Map(), r++;
			for (let { key: e, literal: r } of u) {
				let i = n.get(e);
				i || n.set(e, i = [/* @__PURE__ */ new Map(), /* @__PURE__ */ new Set()]), i[1].add(t);
				let a = i[0].get(r);
				a || i[0].set(r, a = /* @__PURE__ */ new Set()), a.add(t);
			}
		} else {
			i ??= {};
			let e = zs(l);
			for (let n of e) (i[n] ??= []).push(t);
		}
	}
	let c = {}, l = (e) => c[e] ??= Object.freeze(i?.[e] ?? Hs);
	if (o && a) a.forEach(Object.freeze), t = (e) => a.get(e) ?? Hs;
	else if (n?.size === 1 && !i) {
		let [r, [i]] = n.entries().next().value, a = /* @__PURE__ */ new Map();
		for (let [e, t] of i) a.set(e, Object.freeze(Array.from(t)));
		let o = Object.freeze(e.map((e, t) => t));
		t = (e, t) => {
			if (ce(e)) {
				let n = Ws(e, r) ? e[r] : void 0;
				if (n !== void 0) return a.get(n) ?? Hs;
				if (t) return o;
			}
			return Hs;
		};
	} else if (n) {
		let e;
		for (let t of n) (!e || t[1][0].size > e[1][0].size) && t[1][1].size === r && (e = t);
		t = (t, r) => {
			let a = Us(t);
			if (!ce(t)) return l(a);
			let o = new Set(i?.[a]), s;
			if (e) {
				let [n, [i]] = e, c = Ws(t, n), u = c ? t[n] : void 0;
				if (c && (!r || u !== void 0)) {
					let e = i.get(u);
					if (!e) return l(a);
					for (let t of e) o.add(t);
					s = n;
				}
			}
			if (s === void 0) for (let [e, [i, a]] of n) {
				let n = Ws(t, e), s = n ? t[e] : void 0;
				if (n && (!r || s !== void 0)) {
					let e = i.get(s);
					if (e) for (let t of e) o.add(t);
				} else if (r) for (let e of a) o.add(e);
			}
			for (let [e, [i, a]] of n) {
				if (e === s) continue;
				let n = Ws(t, e), c = n ? t[e] : void 0;
				if (n && (!r || c !== void 0)) {
					let e = i.get(c);
					for (let t of o) a.has(t) && !e?.has(t) && o.delete(t);
				}
			}
			return Array.from(o).sort((e, t) => e - t);
		};
	} else t = (e) => {
		let t = l(Us(e));
		return a ? t.filter((t) => s[t] === void 0 || s[t] === e) : t;
	};
	return Vs.set(e, t), t;
}
var Ks = class extends ss {
	_tag = "Union";
	types;
	options;
	encodingChecks;
	constructor(e, t, n, r, i, a, o) {
		super(n, r, i, a), this.types = e, this.options = t, this.encodingChecks = o;
	}
	getParser(e, t) {
		let n = this, r = t !== void 0, i = [], a = (t) => i[t] ??= e(n.types[t]), o;
		return (e, t) => {
			if (e === P) return I;
			let i = (o ??= Gs(n.types))(e, r);
			if (i.length === 0) return j(new Do(n, [], e, t));
			if (i.length === 1) {
				let r = a(i[0])(e, t);
				return r._tag === "Success" ? r : A(r) ? qs(n, r.cause, e, t) : Js(n, r, e, t);
			}
			return Ys(n, a, i, e, t);
		};
	}
	_rebuild(e, t, n) {
		let r = bc(this.types, e);
		return r === this.types && t === this.checks && n === this.encodingChecks ? this : new Ks(r, this.options, this.annotations, t, void 0, this.context, n);
	}
	recur(e) {
		return this._rebuild(e, this.checks, this.encodingChecks);
	}
	flip(e) {
		return this._rebuild(e, this.encodingChecks, this.checks);
	}
	matchPart(e, t) {
		for (let n of this.types) {
			let r = n.matchPart(e, t);
			if (r !== void 0) return r;
		}
	}
	getExpected(e) {
		let t = this.annotations?.expected;
		if (typeof t == "string") return t;
		if (this.types.length === 0) return "never";
		let n = this.types.map((t) => {
			let n = Oc(t);
			switch (n._tag) {
				case "Arrays": {
					let t = n.elements.filter(Qo);
					if (t.length > 0) return `${$s(n.isMutable)}[ ${t.map((t) => e(t) + ec(t.context?.isOptional)).join(", ")}, ... ]`;
					break;
				}
				case "Objects": {
					let t = n.propertySignatures.filter((e) => Qo(e.type));
					if (t.length > 0) return `{ ${t.map((t) => `${$s(t.type.context?.isMutable)}${qe(t.name)}${ec(t.type.context?.isOptional)}: ${e(t.type)}`).join(", ")}, ... }`;
					break;
				}
			}
			return e(n);
		});
		return Array.from(new Set(n)).join(" | ");
	}
};
function qs(e, t, n, r) {
	let i = Mo(t);
	return i ? ma(new Do(e, [i], n, r)) : pa(t);
}
function Js(e, t, n, r) {
	return Ha(t, (t) => qs(e, t, n, r));
}
function Ys(e, t, n, r, i) {
	let a = {
		ast: e,
		parser: t,
		input: r,
		out: void 0,
		successes: e.options?.mode === "oneOf" ? [] : void 0,
		issues: void 0,
		options: i
	}, o = Zs(a, n);
	if (!o) return a.out ? a.out : j(new Do(e, a.issues ?? [], r, i));
	if (A(o)) return Xs(o, a);
	let s = !0;
	return La(() => s ? (s = !1, Xs(o, a)) : Ys(e, t, n, r, i));
}
function Xs(e, t) {
	return M(e, (e) => t.out === L ? Ia(t.input) : t.out ? t.out : j(new Do(t.ast, t.issues ?? [], t.input, t.options)));
}
var Zs = /*#__PURE__*/ ea()({
	onItem(e, t) {
		return e.parser(t)(e.input, e.options);
	},
	step(e, t, n) {
		if (n._tag === "Failure") {
			let t = Mo(n.cause);
			if (t === void 0) return n;
			e.issues ? e.issues.push(t) : e.issues = [t];
		} else {
			if (e.out && e.successes) return e.successes.push(e.ast.types[t]), ma(new Oo(e.ast, e.successes, e.input, e.options));
			if (e.out = n, e.successes) e.successes.push(e.ast.types[t]);
			else return ha;
		}
	}
}), Qs = /*#__PURE__*/ new Ks([
	/*#__PURE__*/ new us("Infinity"),
	/*#__PURE__*/ new us("-Infinity"),
	/*#__PURE__*/ new us("NaN")
]);
function $s(e) {
	return e ? "" : "readonly ";
}
function ec(e) {
	return e ? "?" : "";
}
var tc = class extends n {
	_tag = "Filter";
	run;
	annotations;
	aborted;
	constructor(e, t = void 0, n = !1) {
		super(), this.run = e, this.annotations = t, this.aborted = n;
	}
	annotate(e) {
		return new tc(this.run, {
			...this.annotations,
			...e
		}, this.aborted);
	}
	abort() {
		return new tc(this.run, this.annotations, !0);
	}
	and(e, t) {
		return new nc([this, e], t);
	}
}, nc = class extends n {
	_tag = "FilterGroup";
	checks;
	annotations;
	constructor(e, t = void 0) {
		super(), this.checks = e, this.annotations = t;
	}
	annotate(e) {
		return new nc(this.checks, {
			...this.annotations,
			...e
		});
	}
	and(e, t) {
		return new nc([this, e], t);
	}
};
function rc(e, t, n = !1) {
	return new tc((t, n, r) => jo(n, e(t, n, r), t, r), t, n);
}
function ic(e) {
	return rc((e) => globalThis.Number.isFinite(e), {
		expected: "a finite number",
		representation: {
			id: "effect/schema/isFinite",
			payload: null
		},
		toJsonSchema: () => ({ type: "number" }),
		toCode: () => ({ runtime: "Schema.isFinite()" }),
		arbitraryConstraint: { number: "finite" },
		...e
	});
}
var ac = /*#__PURE__*/ new rs(/*#__PURE__*/ new Ks([/* @__PURE__ */ hc(hs, [/*#__PURE__*/ ic()]), Qs]), /*#__PURE__*/ new Ho(/*#__PURE__*/ zo(), /*#__PURE__*/ Lo((e) => globalThis.Number.isFinite(e) ? e : globalThis.String(e))));
function oc(e, t) {
	let n = new globalThis.RegExp(e), r = {
		source: n.source,
		flags: n.flags
	};
	return rc((e) => (n.lastIndex = 0, n.test(e)), {
		expected: `a string matching the RegExp ${r.source}`,
		representation: {
			id: "effect/schema/isPattern",
			payload: r
		},
		toJsonSchema: () => [{}, !0],
		arbitraryConstraint: { patterns: [r] },
		...t
	});
}
var sc = /*#__PURE__*/ new WeakMap();
function cc(e, t) {
	let n = Object.assign(Object.create(Object.getPrototypeOf(e)), e, t);
	return Reflect.ownKeys(t).every((e) => e === "context" || e === "encoding") && sc.set(n, lc(e)), n;
}
function lc(e) {
	let t = sc.get(e);
	if (t !== void 0) return t;
	if (e.encoding === void 0) return e;
	let n = Object.assign(Object.create(Object.getPrototypeOf(e)), e, { encoding: void 0 });
	return sc.set(e, n), n;
}
function uc(e, t) {
	return e.encoding === t ? e : cc(e, { encoding: t });
}
function dc(e, t) {
	if (e.context === t) return e;
	let n = lc(e);
	return n.context === t && n.encoding === e.encoding ? n : cc(e, { context: t });
}
function fc(e) {
	return e.encoding ? fc(e.encoding[e.encoding.length - 1].to) : e;
}
function pc(e, t) {
	if (e.checks) {
		let n = e.checks[e.checks.length - 1];
		return mc(e, Hn(e.checks.slice(0, -1), n.annotate(t)));
	}
	return cc(e, { annotations: {
		...e.annotations,
		...t
	} });
}
function mc(e, t) {
	if (e._tag === "Suspend" && t) throw Error("Cannot add checks to Suspend");
	return e.checks === t ? e : cc(e, { checks: t });
}
function hc(e, t) {
	return mc(e, Ps(e.checks, t));
}
function gc(e, t) {
	let n = t(e.to);
	return n === e.to ? e : new rs(n, e.transformation);
}
function _c(e, t) {
	let n = e, r = n[n.length - 1], i = gc(r, t);
	return i === r ? e : Hn(e.slice(0, e.length - 1), i);
}
function vc(e, t) {
	function n(r) {
		if (r.encoding) {
			let e = r.encoding[r.encoding.length - 1];
			return t?.stopAt?.(e) ? r : uc(r, _c(r.encoding, n));
		}
		return e(r);
	}
	return u(n);
}
function yc(e, t, n) {
	let r = new rs(e, t);
	return uc(n, n.encoding ? [...n.encoding, r] : [r]);
}
function bc(e, t) {
	let n;
	for (let r = 0; r < e.length; r++) {
		let i = e[r], a = t(i);
		if (n) n[r] = a;
		else if (a !== i) {
			n = Array(e.length);
			for (let t = 0; t < r; t++) n[t] = e[t];
			n[r] = a;
		}
	}
	return n ?? e;
}
function xc(e, t) {
	return dc(e, e.context ? new as(e.context.isOptional, e.context.isMutable, e.context.constructorDefault, {
		...e.context.annotations,
		...t
	}) : new as(!1, !1, void 0, t));
}
function Sc(e, t, n) {
	return yc(e, n, t);
}
function Cc(e) {
	return e.context?.isOptional ?? !1;
}
function wc(e) {
	return e.annotations?.["~structural"] === !0 || e._tag === "FilterGroup" && e.checks.every(wc);
}
function Tc(e) {
	function t(e) {
		return wc(e) ? [e] : e._tag === "FilterGroup" ? e.checks.flatMap(t) : [];
	}
	let n = e.flatMap(t);
	return Un(n) ? n : void 0;
}
function Ec(e) {
	let t = !0;
	function n(e) {
		return t = t && !e.encoding && !ns(e), t && "recur" in e && e.recur(n), e;
	}
	return "recur" in e && e.recur(n), t;
}
var Dc = /*#__PURE__*/ u((e) => {
	let t = lc(e);
	if (t !== e) {
		let n = Dc(t);
		return n === t && e.encoding === void 0 ? e : dc(n, e.context);
	}
	let n = "recur" in e ? e.recur(Dc) : e;
	if ("encodingChecks" in n && n.encodingChecks) {
		let t = Ec(e) ? n.encodingChecks : es(n) || ts(n) || Xo(n) && n.typeParameters.length > 0 ? Tc(n.encodingChecks) : void 0;
		return cc(n, {
			encodingChecks: void 0,
			checks: Ps(n.checks, t)
		});
	}
	return n;
}), Oc = /*#__PURE__*/ u((e) => Dc(Ac(e)));
function kc(e, t) {
	let n = t, r = n.length, i = n[r - 1], a = [new rs(Ac(uc(e, void 0)), n[0].transformation.flip())];
	for (let e = 1; e < r; e++) a.unshift(new rs(Ac(n[e - 1].to), n[e].transformation.flip()));
	let o = Ac(i.to);
	return o.encoding ? uc(o, [...o.encoding, ...a]) : uc(o, a);
}
var Ac = /*#__PURE__*/ l((e) => {
	if (e.encoding) return kc(e, e.encoding);
	let t = lc(e);
	if (t !== e) {
		let n = Ac(t);
		return n === t ? e : dc(n, e.context);
	}
	return "flip" in e ? e.flip(Ac) : "recur" in e ? e.recur(Ac) : e;
});
function jc(e, t) {
	let n = t === 0 ? L : F(t);
	return (r, i) => r === P ? I : r === t ? n : j(new To(e, r, i));
}
function Mc(e, t) {
	return (n, r) => n === P ? I : t(n) ? L : j(new To(e, n, r));
}
var Nc = /*#__PURE__*/ vc((e) => {
	switch (e._tag) {
		default: return e;
		case "Number": return e.toCodecStringTree();
		case "Union": return e.recur(Nc);
	}
}), Pc = /*#__PURE__*/ new globalThis.RegExp(`^${Ss}$`), Fc = /*#__PURE__*/ new globalThis.RegExp(`^(?:${Ss}|Infinity|-Infinity|NaN)$`);
function Ic(e) {
	return oc(Pc, {
		expected: "a string representing a finite number",
		representation: {
			id: "effect/schema/isStringFinite",
			payload: null
		},
		toJsonSchema: () => ({ pattern: Pc.source }),
		...e
	});
}
var Lc = /*#__PURE__*/ hc(fs, [/*#__PURE__*/ Ic()]), Rc = /*#__PURE__*/ new rs(Lc, Jo), zc = /*#__PURE__*/ new rs(/*#__PURE__*/ new Ks([Lc, Qs]), Jo);
function Bc(e, t, n, r, i) {
	for (let a = 0; a < e.length; a++) {
		let o = e[a];
		if (o._tag === "FilterGroup") {
			if (n = Bc(o.checks, t, n, r, i), n && (i.errors !== "all" || n[n.length - 1].filter.aborted)) return n;
		} else {
			let e = o.run(t, r, i);
			if (e) {
				let r = new bo(o, e, t, i);
				if (n ? n.push(r) : n = [r], i.errors !== "all" || o.aborted) return n;
			}
		}
	}
	return n;
}
function Vc(e) {
	if (!Xo(e)) return;
	let t = e.annotations?.[ho];
	return ae(t) ? t(e.typeParameters) : void 0;
}
// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/schema/interpreter.js
var Hc = (e, t, n) => e === L ? n(t) : M(e, n);
function Uc(e) {
	let t = Wc(e);
	return (e, n, r) => {
		try {
			return t(e, n, r);
		} catch (e) {
			return za(e);
		}
	};
}
function Wc(e) {
	if (e._tag === "Middleware") return (t, n, r) => Gc(t === L ? e.decode(F(go(n)), r) : e.decode(Wa(t, go), r));
	let t = e.decode;
	switch (t._tag) {
		case "Passthrough": return (e, t) => e === L ? F(t) : e;
		case "Transform": {
			let e = (e) => e === P ? I : F(t.transform(e));
			return (t, n) => Hc(t, n, e);
		}
		case "TransformOptional": {
			let e = (e) => _o(t.transform(go(e)));
			return (t, n) => Hc(t, n, e);
		}
		case "TransformEffect": return (e, n, r) => Hc(e, n, (e) => e === P ? I : t.transform(e, r));
		case "TransformOptionalEffect": return (e, n, r) => Hc(e, n, (e) => Gc(t.transform(go(e), r)));
	}
}
var Gc = (e) => M(e, _o), Kc = (e, t, n, r) => Ha(r, (r) => Ra(() => da(r, (r) => new xo(e, r, t, n))));
function qc(e, t) {
	let n = Uc(e.link.transformation), r;
	return (i, a) => {
		if (i === P) return I;
		if (e.isConstructed(i)) return L;
		let o = (r ??= t(e.link.to))(i, a);
		return n(o, i, a);
	};
}
function Jc(e, t) {
	let n = e.context.constructorDefault;
	return (r, i) => {
		if (r !== P && r !== void 0) return t(r, i);
		let a = n;
		if (A(a) && a._tag === "Success") {
			let e = t(a[w], i);
			return e === L ? a : e;
		}
		return M(Kc(e, r, i, a), (e) => {
			let n = t(e, i);
			return n === L ? F(e) : n;
		});
	};
}
function Yc(e, t) {
	let n = t(e);
	return e.context?.constructorDefault === void 0 ? n : Jc(e, n);
}
function Xc(e, t, n, r, i) {
	if (e._tag === "Declaration") for (let n of e.typeParameters) t(n);
	let a = n ? Vc(e) : void 0, o = a ? qc(a, t) : r ?? e.getParser(t, n), s = e.checks, c = e.encoding, l = c?.map((e) => Uc(e.transformation)), u = e.encodingChecks;
	if (!c && !s && !u) return o;
	let d, f = (t, n) => {
		let r = o(t, n);
		try {
			if (u && !n.disableChecks) {
				if (A(r)) {
					if (r._tag === "Success") {
						let i = r === L ? t : r[w];
						if (t !== P && i !== P) {
							let i = Bc(u, t, void 0, e, n);
							i && (r = j(new z(e, i, t, n)));
						}
					}
				} else r = Ba(r, (r) => {
					if (t !== P && r !== P) {
						let r = Bc(u, t, void 0, e, n);
						if (r) return j(new z(e, r, t, n));
					}
					return Ia(r);
				});
			}
			if (s && !n.disableChecks) {
				if (A(r)) {
					if (r._tag === "Success") {
						let i = r === L ? t : r[w];
						if (i === P) return r;
						let a = Bc(s, i, void 0, e, n);
						a && (r = j(new z(e, a, i, n)));
					}
				} else r = Ba(r, (t) => {
					if (t !== P) {
						let r = Bc(s, t, void 0, e, n);
						if (r) return j(new z(e, r, t, n));
					}
					return Ia(t);
				});
			}
			return r;
		} catch (e) {
			return za(e);
		}
	}, p = i === void 0 ? f : i(f);
	return c ? (n, r) => {
		let i = d ??= c.map((e) => t(e.to)), a = n, o = i[i.length - 1](n, r);
		for (let e = c.length - 1; e >= 0; e--) if (o = l[e](o, a, r), e !== 0) {
			let t = i[e - 1];
			o._tag === "Success" ? (a = o[w], o = t(a, r)) : o = M(o, (e) => {
				let n = t(e, r);
				return n === L ? F(e) : n;
			});
		}
		if (o._tag === "Success") {
			let e = o[w], t = p(e, r);
			return t === L ? o : t;
		}
		return o = Kc(e, n, r, o), M(o, (e) => {
			let t = p(e, r);
			return t === L ? F(e) : t;
		});
	} : p;
}
// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/schema/compilerRegistry.js
var Zc = /*#__PURE__*/ Symbol(), Qc = /*#__PURE__*/ new WeakMap(), $c = (e) => rl(e).parser, el = (e) => rl(e).makeEffect, tl = (e) => Yc(e, el), nl = class {
	ast;
	constructor(e) {
		this.ast = e;
	}
	get decodeEffect() {
		return this.cachedDecodeEffect ??= Xc(this.ast, $c);
	}
	get parser() {
		return this.decodeEffect;
	}
	get makeEffect() {
		return this.cachedMakeEffect ??= Xc(this.ast, el, tl);
	}
};
function rl(e) {
	let t = Qc.get(e);
	if (t !== void 0) return t;
	let n = new nl(e);
	return Qc.set(e, n), n;
}
// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/SchemaParser.js
function il(e) {
	let t = e.ast, n;
	return (e, r) => (n ??= pl(Sl, Dc(t)))(e, r?.disableChecks ? r?.parseOptions ? {
		...r.parseOptions,
		disableChecks: !0
	} : { disableChecks: !0 } : r?.parseOptions);
}
function al(e) {
	let t = il(e);
	return (e, n) => {
		let r = Ua(t(e, n));
		return ga(r) ? fn(r.value) : (No(r.cause, "Option adapter can only return none for schema issues"), dn());
	};
}
function ol(e) {
	return yl(Dc(e.ast));
}
function sl(e, t) {
	let n = dl(e.ast);
	return t === void 0 ? n : (e, r) => n(e, ll(t, r));
}
function cl(e, t) {
	return hl(sl(e, t));
}
var ll = (e, t) => t ? {
	...e,
	...t
} : e, ul = (e) => e === P ? j(new Eo()) : Ia(e);
function dl(e) {
	return pl(xl, e);
}
function fl(e, t) {
	return e === L ? Ia(t) : A(e) ? e["~effect/Effect/args"] === P ? ul(P) : e : M(e, ul);
}
function pl(e, t) {
	let n;
	return (r, i) => {
		let a = (n ??= e(t))(r, i ?? is);
		return a === L ? Ia(r) : A(a) ? a["~effect/Effect/args"] === P ? ul(P) : a : M(a, ul);
	};
}
function ml(e) {
	return (t, n) => Ua(e(t, n));
}
function hl(e) {
	let t = ml(e);
	return (e, n) => {
		let r = t(e, n);
		return ga(r) ? fn(r.value) : (No(r.cause, "Option adapter can only return none for schema issues"), dn());
	};
}
function gl(e, t) {
	let n = Ua(e);
	if (ga(n)) return n.value;
	let r = No(n.cause, t);
	throw Error("Schema validation failed", { cause: r });
}
var _l = "Constructor adapter can only throw schema issues";
function vl(e) {
	throw Error(_l, { cause: ua(e) });
}
function yl(e) {
	let t;
	return (n, r) => bl(t ??= rl(e), n, r);
}
function bl(e, t, n) {
	let r = n?.disableChecks ? n.parseOptions ? {
		...n.parseOptions,
		disableChecks: !0
	} : { disableChecks: !0 } : n?.parseOptions ?? is, i = e.make;
	if (i !== void 0 && t !== P) {
		let e;
		try {
			e = i(t, r);
		} catch (e) {
			vl(e);
		}
		if (e !== Zc && e !== P) return e;
	}
	return gl(fl(e.makeEffect(t, r), t), _l);
}
var xl = (e) => rl(e).parser, Sl = (e) => rl(e).makeEffect, Cl = "~effect/Schema/Schema", wl = /*#__PURE__*/ Symbol(), Tl = {
	[Cl]: Cl,
	get make() {
		let e = ol(this);
		return Object.defineProperty(this, "make", {
			value: e,
			enumerable: !0
		}), e;
	},
	get makeEffect() {
		let e = il(this);
		return Object.defineProperty(this, "makeEffect", {
			value: e,
			enumerable: !0
		}), e;
	},
	get makeOption() {
		let e = al(this);
		return Object.defineProperty(this, "makeOption", {
			value: e,
			enumerable: !0
		}), e;
	},
	pipe() {
		return e(this, arguments);
	},
	annotate(e) {
		return this.rebuild(pc(this.ast, e));
	},
	annotateKey(e) {
		return this.rebuild(xc(this.ast, e));
	},
	check(...e) {
		return this.rebuild(hc(this.ast, e));
	},
	rebuild(e) {
		return El(e, this[wl]);
	}
};
function El(e, t) {
	function n() {}
	let r = Object.setPrototypeOf(n, Tl);
	return t && (Object.hasOwn(t, "name") || Object.hasOwn(t, "length") || Object.hasOwn(t, "__proto__")) ? Object.defineProperties(r, Object.getOwnPropertyDescriptors({ ...t })) : Object.assign(r, t), r[wl] = t, r.ast = e, r;
}
({ ...C }), { ...C }, { ...C }, { ...C }, { ...C }, { ...C }, { ...C }, { ...C };
var Dl = cl, Ol = El;
function kl(e) {
	let t = Ol(new us(e), {
		literal: e,
		transform(n) {
			return t.pipe(Fl(kl(n), {
				decode: Lo(() => n),
				encode: Lo(() => e)
			}));
		}
	});
	return t;
}
var Al = /*#__PURE__*/ Ol(fs);
function jl(e, t) {
	return Ol(e, {
		fields: t,
		mapFields(e, t) {
			let n = e(this.fields);
			return jl(Fs(n, t?.unsafePreserveChecks ? this.ast.checks : void 0), n);
		}
	});
}
function Ml(e) {
	return jl(Fs(e, void 0), e);
}
function Nl(e, t) {
	return Ol(e, {
		members: t,
		mapMembers(e, t) {
			let n = e(this.members);
			return Nl(Ls(n, this.ast.options, t?.unsafePreserveChecks ? this.ast.checks : void 0), n);
		}
	});
}
function Pl(e, t) {
	return Nl(Ls(e, t, void 0), e);
}
function B(e) {
	let t = e.map(kl);
	return Ol(Ls(t, void 0, void 0), {
		literals: e,
		members: t,
		mapMembers(e) {
			return Pl(e(this.members));
		},
		pick(e) {
			return B(e);
		},
		transform(e) {
			return Pl(t.map((t, n) => t.transform(e[n])));
		}
	});
}
function Fl(e, t) {
	return (n) => Ol(Sc(n.ast, e.ast, t ? Wo(t) : qo()), {
		from: n,
		to: e
	});
}
function Il(e, t) {
	let n = e.source, r = e.flags, i = /^[dg]*uy?$/.test(r), a = r === "" ? `new globalThis.RegExp(${S(n)})` : `new globalThis.RegExp(${S(n)}, ${S(r)})`;
	return oc(e, {
		toJsonSchema: () => i ? { pattern: r.endsWith("y") ? `^(?:${n})` : n } : [{}, !0],
		toCode: () => ({ runtime: `Schema.isPattern(${a})` }),
		...t
	});
}
globalThis.RegExp, globalThis.URL, globalThis.File, globalThis.URLSearchParams, globalThis.Uint8Array;
var Ll = [
	"GreatWhite",
	"Hammerhead",
	"Goldfish",
	"Puffer",
	"Piranha",
	"Angler",
	"Whale",
	"Octopus"
], Rl = [
	"BlueYellow",
	"BluePink",
	"GreenYellow",
	"GreenPink",
	"RedYellow",
	"RedPink",
	"YellowRed",
	"PinkYellow"
], zl = [
	"Spade",
	"Heart",
	"Diamond",
	"Club"
], Bl = [
	"Ace",
	"King",
	"Queen",
	"Jack",
	"Ten",
	"Seven",
	"Two"
], Vl = [
	"Pips",
	"Beads",
	"Sleepy",
	"Slits"
], Hl = [
	"Line",
	"Smirk",
	"Grin",
	"Fangs",
	"GoldTooth",
	"Pucker"
], Ul = [
	"None",
	"Cowboy",
	"Fedora",
	"Visor",
	"Crown",
	"Bandana",
	"Cap"
], Wl = [
	"None",
	"Shades",
	"Round",
	"Monocle",
	"Patch"
], Gl = [
	"None",
	"Chain",
	"BowTie",
	"Bolo"
], Kl = [
	"None",
	"Pips",
	"Index",
	"Chip",
	"Dice",
	"Teardrop",
	"Scar"
], ql = [
	"None",
	"Toothpick",
	"Chip"
], Jl = [
	"Resting",
	"LookingDown",
	"Thinking",
	"Happy",
	"Gutted",
	"Folded"
], Yl = ["Light", "Dark"], Xl = B(Ll), Zl = B(Rl), Ql = B(zl), $l = B(Bl), eu = B(Vl), tu = B(Hl), nu = B(Ul), ru = B(Wl), iu = B(Gl), au = B(Kl), ou = B(ql);
B(Jl), B(Yl);
var su = Ml({
	colour: Zl,
	extra: ou,
	eyes: eu,
	eyewear: ru,
	headwear: nu,
	mark: au,
	mouth: tu,
	neck: iu,
	rank: $l,
	species: Xl,
	suit: Ql
}), cu = 2147483647, lu = 48271, uu = 6, du = (e) => e * lu % cu, fu = (e, t) => t === 0 ? e : fu(du(e), t - 1), V = (e, t) => {
	let n = 0;
	for (let [, t] of e) n += t;
	let r = t % n;
	for (let [t, n] of e) {
		if (r < n) return t;
		r -= n;
	}
	return e[0][0];
}, pu = (e) => {
	let [t, ...n] = e;
	return [[t, 1], ...n.map((e) => [e, 1])];
}, mu = [
	["GreatWhite", 4],
	["Hammerhead", 3],
	["Goldfish", 4],
	["Puffer", 3],
	["Piranha", 3],
	["Angler", 2],
	["Whale", 3],
	["Octopus", 3]
], hu = [
	["Line", 4],
	["Smirk", 3],
	["Grin", 2],
	["Fangs", 2],
	["GoldTooth", 1]
], gu = [
	["Pucker", 5],
	["Smirk", 1],
	["Line", 1],
	["Grin", 1]
], _u = {
	Angler: {
		colours: [
			["BlueYellow", 2],
			["GreenYellow", 2],
			["RedYellow", 1]
		],
		mouths: [["Fangs", 5], ["Grin", 1]],
		rank: "Ten",
		suit: "Club"
	},
	Goldfish: {
		colours: [
			["YellowRed", 4],
			["PinkYellow", 2],
			["RedPink", 2]
		],
		mouths: gu,
		rank: "Two",
		suit: "Heart"
	},
	GreatWhite: {
		colours: [
			["BlueYellow", 4],
			["GreenYellow", 2],
			["RedYellow", 2],
			["BluePink", 1]
		],
		mouths: hu,
		rank: "King",
		suit: "Spade"
	},
	Hammerhead: {
		colours: [
			["GreenYellow", 3],
			["BlueYellow", 2],
			["BluePink", 2],
			["RedYellow", 1]
		],
		mouths: hu,
		rank: "Ace",
		suit: "Spade"
	},
	Octopus: {
		colours: [
			["RedPink", 3],
			["BlueYellow", 2],
			["GreenPink", 2]
		],
		mouths: [
			["Line", 3],
			["Smirk", 2],
			["Pucker", 2],
			["Grin", 1]
		],
		rank: "Queen",
		suit: "Club"
	},
	Piranha: {
		colours: [
			["RedYellow", 3],
			["GreenPink", 1],
			["BlueYellow", 1],
			["RedPink", 1]
		],
		mouths: [
			["Fangs", 4],
			["Grin", 2],
			["GoldTooth", 1]
		],
		rank: "Jack",
		suit: "Diamond"
	},
	Puffer: {
		colours: [
			["YellowRed", 3],
			["PinkYellow", 2],
			["GreenPink", 1],
			["BluePink", 1]
		],
		mouths: gu,
		rank: "Seven",
		suit: "Heart"
	},
	Whale: {
		colours: [
			["PinkYellow", 3],
			["BluePink", 2],
			["YellowRed", 1]
		],
		mouths: [
			["Line", 4],
			["Smirk", 1],
			["Grin", 1]
		],
		rank: "King",
		suit: "Diamond"
	}
}, vu = [
	["Pips", 5],
	["Beads", 2],
	["Sleepy", 2],
	["Slits", 2]
], yu = [
	["None", 14],
	["Cowboy", 2],
	["Fedora", 2],
	["Visor", 2],
	["Crown", 2],
	["Bandana", 2],
	["Cap", 2]
], bu = [
	["None", 12],
	["Shades", 5],
	["Round", 2],
	["Monocle", 1],
	["Patch", 1]
], xu = [
	["None", 8],
	["Chain", 5],
	["BowTie", 2],
	["Bolo", 2]
], Su = [
	["None", 12],
	["Pips", 2],
	["Index", 2],
	["Chip", 1],
	["Dice", 1],
	["Teardrop", 1],
	["Scar", 1]
], Cu = [
	["None", 14],
	["Toothpick", 3],
	["Chip", 2]
], wu = 3, Tu = 8, Eu = 6, Du = (e) => [
	e.headwear !== "None",
	e.eyewear !== "None",
	e.neck !== "None",
	e.mark !== "None",
	e.extra !== "None"
].filter(Boolean).length, Ou = (e) => Du(e) <= wu ? e : e.extra === "None" ? e.mark === "None" ? {
	...e,
	neck: "None"
} : Ou({
	...e,
	mark: "None"
}) : Ou({
	...e,
	extra: "None"
}), ku = (e) => {
	let t = fu(1 + Math.abs(Math.trunc(e)) % 2147483646, uu), n = (e) => fu(t, e + 1), r = V(mu, n(0)), i = _u[r], a = n(11) % 10 < Eu;
	return Ou({
		colour: n(1) % 10 < Tu ? V(i.colours, n(2)) : V(pu(Rl), n(2)),
		extra: V(Cu, n(3)),
		eyes: V(vu, n(4)),
		eyewear: V(bu, n(5)),
		headwear: V(yu, n(6)),
		mark: V(Su, n(7)),
		mouth: V(i.mouths, n(8)),
		neck: V(xu, n(9)),
		rank: a ? i.rank : V(pu(Bl), n(10)),
		species: r,
		suit: a ? i.suit : V(pu(zl), n(12))
	});
}, Au = "h1", ju = "0123456789abcdefghijklmnopqrstuvwxyz", H = (e) => ({
	decode: (t) => e[ju.indexOf(t)] ?? e[0],
	encode: (t) => ju.charAt(e.indexOf(t)),
	pattern: `[${ju.slice(0, e.length)}]`
}), U = {
	colour: H(Rl),
	extra: H(ql),
	eyes: H(Vl),
	eyewear: H(Wl),
	headwear: H(Ul),
	mark: H(Kl),
	mouth: H(Hl),
	neck: H(Gl),
	rank: H(Bl),
	species: H(Ll),
	suit: H(zl)
}, Mu = [
	"species",
	"colour",
	"suit",
	"rank",
	"eyes",
	"mouth",
	"headwear",
	"eyewear",
	"neck",
	"mark",
	"extra"
], Nu = RegExp(`^${Au}${Mu.map((e) => U[e].pattern).join("")}$`, "u"), W = (e, t) => e.charAt(2 + Mu.indexOf(t)), Pu = (e) => Au + U.species.encode(e.species) + U.colour.encode(e.colour) + U.suit.encode(e.suit) + U.rank.encode(e.rank) + U.eyes.encode(e.eyes) + U.mouth.encode(e.mouth) + U.headwear.encode(e.headwear) + U.eyewear.encode(e.eyewear) + U.neck.encode(e.neck) + U.mark.encode(e.mark) + U.extra.encode(e.extra);
Dl(Al.check(Il(Nu)).pipe(Fl(su, Go({
	decode: (e) => ({
		colour: U.colour.decode(W(e, "colour")),
		extra: U.extra.decode(W(e, "extra")),
		eyes: U.eyes.decode(W(e, "eyes")),
		eyewear: U.eyewear.decode(W(e, "eyewear")),
		headwear: U.headwear.decode(W(e, "headwear")),
		mark: U.mark.decode(W(e, "mark")),
		mouth: U.mouth.decode(W(e, "mouth")),
		neck: U.neck.decode(W(e, "neck")),
		rank: U.rank.decode(W(e, "rank")),
		species: U.species.decode(W(e, "species")),
		suit: U.suit.decode(W(e, "suit"))
	}),
	encode: Pu
}))));
// ../../packages/avatar/dist/palette.js
var Fu = "#1f1c31", Iu = "#3c67e8", Lu = "#00a768", Ru = "#f590b8", zu = "#ef5326", Bu = "#f4b93c", Vu = {
	Dark: {
		edge: "rgba(0,0,0,0.8)",
		gap: "#16141d",
		light: "rgba(255,255,255,0.14)",
		shadow: "rgba(0,0,0,0.62)",
		stock: "#fbf7ef"
	},
	Light: {
		edge: "rgba(40,24,70,0.52)",
		gap: "#f6f1e8",
		light: "rgba(255,255,255,0.7)",
		shadow: "rgba(40,24,70,0.32)",
		stock: "#fffdf8"
	}
}, Hu = {
	BluePink: {
		body: Iu,
		fin: Ru
	},
	BlueYellow: {
		body: Iu,
		fin: Bu
	},
	GreenPink: {
		body: Lu,
		fin: Ru
	},
	GreenYellow: {
		body: Lu,
		fin: Bu
	},
	PinkYellow: {
		body: Ru,
		fin: Bu
	},
	RedPink: {
		body: zu,
		fin: Ru
	},
	RedYellow: {
		body: zu,
		fin: Bu
	},
	YellowRed: {
		body: Bu,
		fin: zu
	}
}, G = (e) => String(Number(e.toFixed(2))), Uu = 2147483647, Wu = 16807, Gu = (e) => {
	let t = { value: Math.abs(Math.floor(e)) % 2147483646 + 1 };
	return () => (t.value = t.value * Wu % Uu, (t.value - 1) / 2147483646);
}, Ku = (e) => e.reduce((e, [t, n], r) => e + (t * 131 + n * 71) * (r + 3), 17), qu = (e, t, n) => t + (n - t) * e(), Ju = (e) => {
	let t = Math.max(e.length, 1);
	return [e.reduce((e, [t]) => e + t, 0) / t, e.reduce((e, [, t]) => e + t, 0) / t];
}, Yu = (e) => {
	let t = e.map(([e]) => e), n = e.map(([, e]) => e);
	return (Math.max(...t) - Math.min(...t)) * (Math.max(...n) - Math.min(...n));
}, K = (e, t) => e[(t % e.length + e.length) % e.length] ?? [0, 0], Xu = (e, t) => {
	let [n, r] = K(e, t - 1), [i, a] = K(e, t), [o, s] = K(e, t + 1), c = n - i, l = r - a, u = o - i, d = s - a, f = (c * u + l * d) / Math.max(Math.hypot(c, l) * Math.hypot(u, d), 1e-4);
	return Math.acos(Math.min(Math.max(f, -1), 1)) * 180 / Math.PI;
}, Zu = .2, Qu = .12, $u = 80, ed = (e, t, n) => {
	let r = Gu(t), i = e.map((t, i) => Xu(e, i) < $u || r() < Qu || n.has(i) ? 0 : Zu), a = e.map((t, n) => {
		let r = K(e, n + 1), a = K(e, n - 1), o = K(e, n + 2), s = i[n] ?? 0, c = i[(n + 1) % e.length] ?? 0;
		return `C${G(t[0] + (r[0] - a[0]) * s)} ${G(t[1] + (r[1] - a[1]) * s)} ${G(r[0] - (o[0] - t[0]) * c)} ${G(r[1] - (o[1] - t[1]) * c)} ${G(r[0])} ${G(r[1])}`;
	}), o = K(e, 0);
	return `M${G(o[0])} ${G(o[1])}${a.join("")}Z`;
}, td = (e, t) => {
	let n = e.map((n, r) => {
		let i = K(e, r - 1), a = K(e, r + 1), o = Math.hypot(n[0] - i[0], n[1] - i[1]), s = Math.hypot(a[0] - n[0], a[1] - n[1]), c = Math.min(t, o / 2.2, s / 2.2);
		return [
			[n[0] + (i[0] - n[0]) / Math.max(o, 1e-4) * c, n[1] + (i[1] - n[1]) / Math.max(o, 1e-4) * c],
			n,
			[n[0] + (a[0] - n[0]) / Math.max(s, 1e-4) * c, n[1] + (a[1] - n[1]) / Math.max(s, 1e-4) * c]
		];
	}), r = n[0]?.[2] ?? [0, 0], i = [...n.slice(1), ...n.slice(0, 1)].map(([e, t, n]) => `L${G(e[0])} ${G(e[1])}Q${G(t[0])} ${G(t[1])} ${G(n[0])} ${G(n[1])}`).join("");
	return `M${G(r[0])} ${G(r[1])}${i}Z`;
}, nd = 12, rd = 900, id = 1.8, ad = 1e3, od = (e, t, n) => e.length >= nd && n.size === 0 ? td(e, ad) : Yu(e) > rd ? ed(e, t, n) : td(e, id), sd = (e, t, n) => {
	let r = t * Math.PI / 180, i = Math.cos(r), a = Math.sin(r), o = e[0] - n[0], s = e[1] - n[1];
	return [n[0] + o * i - s * a, n[1] + o * a + s * i];
}, cd = (e, t, n) => {
	let r = (n - e[1]) / (t[1] - e[1]);
	return [e[0] + (t[0] - e[0]) * r, n];
}, ld = (e, t) => {
	let n = [], r = /* @__PURE__ */ new Set();
	for (let [i, a] of e.entries()) {
		let o = K(e, i + 1), s = a[1] >= t;
		s && n.push(a), s !== o[1] >= t && (r.add(n.length), n.push(cd(a, o, t)));
	}
	return {
		pinned: r,
		points: n
	};
}, ud = (e, t) => ld(e.map(([e, n]) => [e, 2 * t - n]), t), q = (e, t) => Array.from({ length: 12 }, (n, r) => [e[0] + t * Math.cos(r * Math.PI / 6), e[1] + t * Math.sin(r * Math.PI / 6)]), J = (e, t, n) => {
	let r = Math.max(Math.hypot(t[0] - e[0], t[1] - e[1]), .001), i = -(t[1] - e[1]) / r * (n / 2), a = (t[0] - e[0]) / r * (n / 2);
	return [
		[e[0] + i, e[1] + a],
		[t[0] + i, t[1] + a],
		[t[0] - i, t[1] - a],
		[e[0] - i, e[1] - a]
	];
}, dd = {
	Club: "M50 8A21 21 0 1 1 49.9 8ZM29 38A21 21 0 1 1 28.9 38ZM71 38A21 21 0 1 1 70.9 38ZM45 56C45 78 38 90 28 96L72 96C62 90 55 78 55 56Z",
	Diamond: "M50 2C58 20 72 38 88 50C72 62 58 80 50 98C42 80 28 62 12 50C28 38 42 20 50 2Z",
	Heart: "M50 94C40 80 6 60 6 32C6 14 20 5 33 6C42 7 48 14 50 22C52 14 58 7 67 6C80 5 94 14 94 32C94 60 60 80 50 94Z",
	Spade: "M50 4C42 20 8 36 8 60C8 78 30 86 45 72C43 84 37 92 28 96L72 96C63 92 57 84 55 72C70 86 92 78 92 60C92 36 58 20 50 4Z"
}, fd = {
	Ace: "M-2.9 3.9L0 -3.9L2.9 3.9M-1.6 1.2H1.6",
	Jack: "M1.6 -3.9V1.4Q1.6 3.9 -0.6 3.9Q-2.4 3.9 -2.6 2.1",
	King: "M-2.3 -3.9V3.9M2.5 -3.9L-2.1 0.9M-0.6 -0.5L2.7 3.9",
	Queen: "M0 -3.9A2.8 3.9 0 1 1 0 3.9A2.8 3.9 0 1 1 0 -3.9ZM0.9 1.9L2.9 4.1",
	Seven: "M-2.6 -3.9H2.7L-0.5 3.9",
	Ten: "M-4.1 -2.6L-2.9 -3.9V3.9M1.7 -3.9A1.9 3.9 0 1 1 1.7 3.9A1.9 3.9 0 1 1 1.7 -3.9Z",
	Two: "M-2.5 -1.8Q-2.4 -3.9 0 -3.9Q2.6 -3.9 2.6 -1.7Q2.6 0 -2.6 3.9H2.8"
}, pd = /* @__PURE__ */ new Set(), md = {
	Body: "Body",
	Fin: "Fin",
	Flat: "Stock",
	Gold: "Gold",
	Ink: "Ink",
	Stock: "Stock"
}, Y = (e, t, n = md[t]) => ({
	hole: [],
	kind: "Cut",
	paint: n,
	pinned: pd,
	points: e,
	rise: 1,
	role: t,
	seed: Ku(e)
}), hd = (e, t, n, r = md[n]) => ({
	...Y(e, n, r),
	hole: t
}), X = (e, t) => Y(e, "Flat", t), gd = (e, t, n, r, i = 0) => ({
	at: t,
	kind: "Pip",
	paint: r,
	size: n,
	suit: e,
	turn: i
}), _d = (e, t, n, r, i = 0) => ({
	at: t,
	kind: "Glyph",
	paint: r,
	rank: e,
	size: n,
	turn: i
}), vd = (e) => e === "Heart" || e === "Diamond" ? "Red" : "Ink", yd = (e, t, n, r) => [_d(e, n, r, vd(t)), gd(t, [n[0], n[1] + r * .95], r * .8, vd(t))], bd = (e, t, n) => e.map(([e, r]) => [t[0] + e * n, t[1] + r * n]), xd = (e, t, n) => e.map((e) => e.kind === "Cut" ? {
	...e,
	hole: e.hole.map(t),
	points: e.points.map(t)
} : {
	...e,
	at: t(e.at),
	turn: e.turn + n
}), Sd = (e, t, n) => t === 0 ? e : xd(e, (e) => sd(e, t, n), t), Cd = (e, t) => t === 1 ? e : e.map((e) => e.kind === "Cut" ? {
	...e,
	rise: e.rise * t
} : e), wd = (e, t, n) => t === 0 && n === 0 ? e : xd(e, ([e, r]) => [e + t, r + n], 0), Td = (e) => e.kind === "Cut" ? Math.max(...e.points.map(([, e]) => e)) : e.at[1] + e.size / 2, Ed = (e, t) => e.flatMap((e) => {
	if (Td(e) <= t) return [];
	if (e.kind !== "Cut") return e.at[1] >= t ? [e] : [];
	if (Math.min(...e.points.map(([, e]) => e)) >= t) return [e];
	let n = ld(e.points, t);
	return n.points.length < 3 ? [] : [{
		...e,
		hole: [],
		pinned: n.pinned,
		points: n.points
	}];
}), Dd = {
	Body: 1,
	Fin: .9,
	Flat: 0,
	Gold: 1.9,
	Ink: 1.7,
	Stock: 1.35
}, Od = 1.15, kd = 1.8, Ad = 1.4, jd = 56, Md = 1.5, Nd = 3, Pd = [.55, 1], Fd = .55, Id = [-.7, -.8], Ld = 1.5, Rd = {
	Blue: Iu,
	Gold: Bu,
	Green: Lu,
	Ink: Fu,
	Pink: Ru,
	Red: zu
}, zd = (e, t) => e === "Body" ? t.pair.body : e === "Fin" ? t.pair.fin : e === "Stock" ? Vu[t.theme].stock : e === "Accent" ? t.pair.body === "#ef5326" ? Iu : zu : Rd[e], Bd = (e, t, n, r, i = "") => {
	if (n <= 0) return `<path d="${e}" fill="${t}"${i}/>`;
	let a = Vu[r.theme], o = 100 / r.px, s = r.px < jd, c = Math.max(kd, (s ? Md : Ad) * o) * n, l = Math.max(Fd * o, .5) * 2;
	return `<path d="${e}" fill="${s ? a.edge : a.shadow}" transform="translate(${G(Pd[0] * c)} ${G(Pd[1] * c)})"${i}/><path d="${e}" fill="none" stroke="${a.gap}" stroke-width="${G(l)}" stroke-linejoin="round"/><path d="${e}" fill="${a.light}" transform="translate(${G(Id[0] * o)} ${G(Id[1] * o)})"${i}/><path d="${e}" fill="${t}"${i}/>`;
}, Vd = (e, t) => {
	let n = od(e.points, e.seed, e.pinned), r = e.hole.length === 0 ? n : `${n}${od(e.hole, e.seed + 1, pd)}`, i = e.hole.length === 0 ? "" : " fill-rule=\"evenodd\"", a = Dd[e.role] * Od * e.rise, o = Bd(r, zd(e.paint, t), a, t, i);
	if (a <= 0) return o;
	let s = Gu(e.seed), [c, l] = Ju(e.points), u = qu(s, -1.5, Ld), d = qu(s, -1.5 * .35, Ld * .35), f = qu(s, -1.5 * .35, Ld * .35);
	return `<g transform="translate(${G(d)} ${G(f)}) rotate(${G(u)} ${G(c)} ${G(l)})">${o}</g>`;
}, Hd = (e, t, n, r) => `translate(${G(e[0])} ${G(e[1])})${t === 0 ? "" : ` rotate(${G(t)})`} scale(${G(n / r)})`, Ud = 2.3, Wd = (e, t) => e.kind === "Cut" ? Vd(e, t) : e.kind === "Pip" ? `<path d="${dd[e.suit]}" fill="${zd(e.paint, t)}" transform="${Hd(e.at, e.turn, e.size, 100)} translate(-50 -50)"/>` : e.size * t.px / 100 < Nd ? "" : `<path d="${fd[e.rank]}" fill="none" stroke="${zd(e.paint, t)}" stroke-width="${Ud}" stroke-linecap="round" stroke-linejoin="round" transform="${Hd([e.at[0], e.at[1] - e.size * .08], e.turn, e.size * .875, 10)}"/>`, Gd = (e, t) => e.map((e) => Wd(e, t)).join(""), Kd = [
	[-.62, -.2],
	[-.2, -.64],
	[.55, -.52],
	[.68, .1],
	[.2, .64],
	[-.52, .52]
], qd = [
	[-.7, -.08],
	[-.24, -.34],
	[.6, -.3],
	[.72, .06],
	[.24, .32],
	[-.56, .28]
], Jd = [
	[-.3, -.12],
	[-.12, -.3],
	[.12, -.3],
	[.3, -.12],
	[.3, .12],
	[.12, .3],
	[-.12, .3],
	[-.3, .12]
], Yd = {
	Gutted: .1,
	LookingDown: .24,
	Thinking: -.14
}, Xd = -.08, Zd = (e, t, n) => Y([
	[e - n * .62, t + n * .32],
	[e, t - n * .42],
	[e + n * .62, t + n * .32],
	[e + n * .36, t + n * .46],
	[e, t + .02 * n],
	[e - n * .36, t + n * .46]
], "Ink"), Qd = (e, t, n, r) => Y([
	[e - n * .74, t - n * .74],
	[e + n * .74, t - n * .7],
	[e + n * .72, t + r],
	[e - n * .74, t + r + n * .08]
], "Body"), $d = (e, t, n, r, i) => e === "Pips" || e === "Sleepy" ? gd(t, n, r * .8, vd(t), i) : X(bd(Jd, n, e === "Slits" ? r * .8 : r * 1.3), "Ink"), ef = (e, t, n) => {
	let { left: r, right: i, size: a, y: o } = n;
	return t === "LookingDown" ? [Qd(r, o, a, 0), Qd(i, o, a, 0)] : t === "Thinking" ? e === "Sleepy" ? [Qd(r, o, a, Xd * a), Qd(i, o, a, -a * .2)] : [Qd(i, o, a, -a * .14)] : e === "Sleepy" ? [Qd(r, o, a, Xd * a), Qd(i, o, a, Xd * a)] : [];
}, tf = (e, t, n, r) => {
	let { left: i, right: a, size: o, y: s } = r;
	if (n === "Happy") return [Zd(i, s, o), Zd(a, s, o)];
	let c = (Yd[n] ?? 0) * o, l = n === "Thinking" ? o * .2 : 0, u = n === "Gutted" ? 180 : 0, d = e === "Slits" ? qd : Kd, f = e === "Slits" ? .4 : 1, p = e === "Beads" ? o * .78 : o;
	return [
		Y(bd(d, [i, s], p), "Stock"),
		Y(bd(d, [a, s], p), "Stock"),
		$d(e, t, [i + l, s + c * f], o, u),
		$d(e, t, [a + l, s + c * f], o, u),
		...e === "Slits" ? [] : ef(e, n, r)
	];
}, nf = {
	Gutted: -3.2,
	Thinking: 0
}, rf = 2.4, af = (e, t, n) => {
	if (e === "Happy" || e === "Folded") return [];
	let { left: r, right: i } = t, { half: a, y: o } = n, s = nf[e] ?? rf, c = [
		[r - a, o - s * .6],
		[r + a, o + s * .6],
		[r + a, o + s * .6 + 2.8],
		[r - a, o - s * .6 + 2.2]
	], l = e === "Thinking" ? [
		[i - a, o - 3.4],
		[i + a, o - 5.6],
		[i + a, o - 2.8],
		[i - a, o - 1]
	] : [
		[i + a, o - s * .6],
		[i - a, o + s * .6],
		[i - a, o + s * .6 + 2.8],
		[i + a, o - s * .6 + 2.2]
	];
	return [Y(c, "Ink"), Y(l, "Ink")];
}, of = (e, t) => {
	let { half: n, x: r, y: i } = e;
	if (e.wide) return [Y([
		[r - n, i - 2],
		[r + n, i - 2],
		[r + n * .7, i + 5],
		[r - n * .7, i + 5]
	], "Ink"), X([
		[r - n * .53, i],
		[r + n * .53, i],
		[r + n * .41, i + 3.4],
		[r - n * .41, i + 3.4]
	], "Red")];
	let a = Array.from({ length: 5 }, (e, a) => {
		let o = r - n * .9 + a * n * 1.8 / 5;
		return X([
			[o, i - 3],
			[o + n * 1.8 / 5, i - 3],
			[o + n * .9 / 5, i + .8]
		], t === "GoldTooth" && a === 1 ? "Gold" : "Stock");
	});
	return [
		Y([
			[r - n, i - 3.4],
			[r + n, i - 3.4],
			[r + n * .55, i + 8],
			[r - n * .6, i + 7.6]
		], "Ink"),
		X([
			[r - n * .36, i + 4.4],
			[r + n * .34, i + 4.2],
			[r + n * .24, i + 7.2],
			[r - n * .3, i + 7.2]
		], "Red"),
		...a
	];
}, sf = (e) => {
	let { half: t, x: n, y: r } = e;
	return e.wide ? [Y([
		[n - t * .94, r + 4],
		[n, r - 3],
		[n + t * .94, r + 4],
		[n + t * .94, r + 6.4],
		[n, r],
		[n - t * .94, r + 6.4]
	], "Ink")] : [Y([
		[n - t * .72, r + 4.6],
		[n, r - 1.2],
		[n + t * .72, r + 4.6],
		[n + t * .5, r + 6.4],
		[n, r + 2.2],
		[n - t * .5, r + 6.4]
	], "Ink")];
}, cf = (e) => {
	let { half: t, x: n, y: r } = e;
	return e.wide ? [Y([
		[n - t * .82, r + 2],
		[n + t * .88, r - 3],
		[n + t * .88, r - .4],
		[n - t * .82, r + 4.6]
	], "Ink")] : [Y([
		[n - t * .15, r + 1.2],
		[n + t * .8, r - 1.4],
		[n + t * .82, r + 1.4],
		[n - t * .12, r + 3.4]
	], "Ink")];
}, lf = (e) => {
	let { half: t, x: n, y: r } = e;
	return e.wide ? Y([
		[n - t * 1.09, r - 4],
		[n - t * .82, r],
		[n + t * .82, r],
		[n + t * 1.09, r - 4],
		[n + t * .88, r + 3],
		[n - t * .88, r + 3]
	], "Ink") : Y([
		[n - t, r - 1],
		[n + t, r - 1.8],
		[n + t * .8, r + 2],
		[n - t * .82, r + 2.2]
	], "Ink");
}, uf = (e, t, n) => [Y([
	[e - 6.4 * n, t - 4 * n],
	[e, t - 7.4 * n],
	[e + 6.4 * n, t - 4 * n],
	[e + 6.4 * n, t + 2.4 * n],
	[e, t + 5.6 * n],
	[e - 6.4 * n, t + 2.4 * n]
], "Stock"), X([
	[e - 2.8 * n, t - 2.6 * n],
	[e + 2.8 * n, t - 2.6 * n],
	[e + 2.8 * n, t + 1.6 * n],
	[e - 2.8 * n, t + 1.6 * n]
], "Ink")], df = (e, t) => {
	let { half: n, x: r, y: i } = t, a = t.wide ? 1.4 : Math.min(n / 9.5, 1.3);
	if (e === "Pucker") return uf(r, i, a);
	if (e === "Smirk") return [Y([
		[r - n * .9, i - .4],
		[r + n * .52, i - 1.4],
		[r + n, i - 5.2],
		[r + n * 1.04, i - 1],
		[r + n * .6, i + 2],
		[r - n * .8, i + 2.4]
	], "Ink")];
	if (e === "Grin") return [Y([
		[r - n * 1.04, i - 3],
		[r + n * 1.04, i - 3.4],
		[r + n * .7, i + 3.4],
		[r, i + 5.6],
		[r - n * .7, i + 3.6]
	], "Ink"), X([
		[r - n * .82, i - 1.8],
		[r + n * .82, i - 2.1],
		[r + n * .68, i + .6],
		[r - n * .68, i + .8]
	], "Stock")];
	if (e === "Fangs") {
		let e = (e) => Y([
			[e - 2.2 * a, i + 1],
			[e + 2.2 * a, i + 1],
			[e, i + 1 + 4.6 * a]
		], "Stock");
		return [
			e(r - n * .5),
			e(r + n * .5),
			lf(t)
		];
	}
	return e === "GoldTooth" ? [lf(t), Y([
		[r - n * .42, i],
		[r - n * .42 + 4.2 * a, i - .2],
		[r - n * .42 + 4.2 * a, i + 4 * a],
		[r - n * .42, i + 4.2 * a]
	], "Gold")] : [lf(t)];
}, ff = (e, t, n) => t === "Happy" ? of(n, e) : t === "Gutted" ? sf(n) : t === "Thinking" ? e === "Pucker" ? df(e, {
	...n,
	x: n.x + n.half * .74
}) : cf(n) : df(e, n), pf = (e, t) => [
	[e[0] - t, e[1] - t],
	[e[0] + t, e[1] - t],
	[e[0] + t, e[1] + t],
	[e[0] - t, e[1] + t]
], mf = (e) => [
	hd(q(e, 6), q(e, 3.6), "Flat", "Ink"),
	...[
		0,
		3,
		6,
		9
	].map((t) => {
		let n = t * Math.PI / 6 + Math.PI / 4;
		return X(pf([e[0] + 4.8 * Math.cos(n), e[1] + 4.8 * Math.sin(n)], 1.05), "Stock");
	}),
	X(q(e, 1.6), "Ink")
], hf = (e) => Sd([
	X(pf(e, 5.2), "Ink"),
	X(pf([e[0] - 2.6, e[1] - 2.6], 1.05), "Stock"),
	X(pf(e, 1.05), "Stock"),
	X(pf([e[0] + 2.6, e[1] + 2.6], 1.05), "Stock")
], 14, e), gf = (e) => {
	let { left: t, size: n } = e.eyes, r = t - n * .2, i = Math.max(e.eyes.y + n * .95, e.glasses.y + e.glasses.height) + 3;
	return [X([
		[r, i - 3.8],
		[r + 2.2, i],
		[r + 1.6, i + 2],
		[r, i + 2.8],
		[r - 1.6, i + 2],
		[r - 2.2, i]
	], "Ink")];
}, _f = (e) => {
	let [t, n] = e;
	return [X(J([t - 7, n - 5.4], [t + 7, n + 5.4], 2.6), "Stock"), ...[
		-4,
		0,
		4
	].map((e) => X(J([t + e * 1.27 - 2, n + e + 2.5], [t + e * 1.27 + 2, n + e - 2.5], 1.2), "Ink"))];
}, vf = (e, t) => {
	let n = t.cheek, [r, i] = n;
	return e.mark === "Pips" ? [
		-1,
		0,
		1
	].map((t) => gd(e.suit, [r + t * 5.2, i + t * 3.4], 5, "Ink")) : e.mark === "Index" ? [_d(e.rank, [r, i - 3.4], 7, "Ink"), gd(e.suit, [r, i + 3.6], 5.6, "Ink")] : e.mark === "Chip" ? mf(n) : e.mark === "Dice" ? hf(n) : e.mark === "Teardrop" ? gf(t) : e.mark === "Scar" ? _f(n) : [];
}, yf = () => [], bf = (e, t, n) => Sd([Y([
	[39 + n, 24],
	[55 + n, -1],
	[61 + n, -2],
	[68 + n, 24]
], "Stock"), ...yd(e, t, [58.6 + n, 5], 5.4)], -8, [60 + n, 12]), xf = (e, t, n, r) => {
	let [i, a] = n;
	return Sd([Y([
		[i, a],
		[i + 16, a],
		[i + 16, a + 20],
		[i, a + 20]
	], "Stock"), ...yd(e, t, [i + 4.4, a + 4.6], 5)], r, [i + 8, a + 10]);
}, Sf = (e) => [Y(e, "Fin"), Y(e.map(([e, t]) => [100 - e, t]), "Fin")], Cf = [
	[15, 53],
	[21, 30],
	[37, 15],
	[63, 15],
	[80, 29],
	[86, 52],
	[71, 69],
	[29, 69]
], wf = {
	behind: (e, t) => [...bf(e, t, 0), ...Sf([
		[24, 57],
		[6, 66],
		[11, 72],
		[28, 65]
	])],
	body: [
		Y(Cf, "Body"),
		Y([
			[20, 50],
			[81, 50],
			[73, 72],
			[28, 72]
		], "Stock"),
		X([
			[19, 40],
			[21.5, 39],
			[23.5, 48],
			[21, 49]
		], "Stock"),
		X([
			[24.5, 41],
			[27, 40],
			[28, 49],
			[25.5, 50]
		], "Stock")
	],
	brows: {
		half: 7.5,
		y: 25.5
	},
	cheek: [74, 52],
	eyes: {
		left: 37,
		right: 63,
		size: 8.4,
		y: 32
	},
	fold: 31,
	front: yf,
	glasses: {
		height: 14,
		inner: 11,
		outer: 22,
		y: 32
	},
	hat: {
		tilt: 0,
		width: 46,
		x: 50,
		y: 17
	},
	mouth: {
		half: 17,
		wide: !1,
		x: 50,
		y: 56
	},
	neck: {
		left: 28,
		right: 72,
		sag: 9,
		y: 69
	},
	outline: [Cf, [
		[37, 22],
		[57, -3],
		[67, 22]
	]]
}, Tf = [
	[17, 43],
	[29, 24],
	[50, 18],
	[71, 23],
	[83, 42],
	[77, 61],
	[61, 71],
	[39, 71],
	[23, 61]
], Ef = [
	[32, 26],
	[36, 5],
	[57, 3],
	[68, 26]
], Df = {
	behind: (e, t) => [
		Y(Ef, "Stock"),
		...yd(e, t, [41.5, 9.5], 6),
		X([
			[57, 3],
			[61, 9],
			[68, 26]
		], "Fin"),
		Y([
			[22, 46],
			[2, 36],
			[9, 50],
			[3, 64],
			[22, 58]
		], "Fin"),
		Y([
			[78, 46],
			[98, 36],
			[91, 50],
			[97, 64],
			[78, 58]
		], "Fin")
	],
	body: [Y(Tf, "Body"), Y([
		[26, 61],
		[40, 56],
		[50, 62],
		[60, 56],
		[74, 61],
		[62, 75],
		[38, 75]
	], "Fin")],
	brows: {
		half: 7.5,
		y: 23.5
	},
	cheek: [76, 50],
	eyes: {
		left: 35,
		right: 65,
		size: 15.5,
		y: 37
	},
	fold: 30,
	front: yf,
	glasses: {
		height: 17,
		inner: 13,
		outer: 21,
		y: 34
	},
	hat: {
		tilt: 0,
		width: 44,
		x: 50,
		y: 20
	},
	mouth: {
		half: 9.5,
		wide: !1,
		x: 50,
		y: 54
	},
	neck: {
		left: 34,
		right: 66,
		sag: 7,
		y: 72
	},
	outline: [Tf, Ef]
}, Of = [
	[23, 46],
	[25, 21],
	[38, 6],
	[62, 6],
	[75, 21],
	[77, 46],
	[67, 63],
	[33, 63]
], kf = [
	[
		[28, 56],
		[13, 59],
		[6, 72],
		[13, 82],
		[18, 77],
		[13, 70],
		[18, 66],
		[32, 64]
	],
	[
		[72, 56],
		[87, 59],
		[94, 72],
		[87, 82],
		[82, 77],
		[87, 70],
		[82, 66],
		[68, 64]
	],
	[
		[36, 60],
		[29, 77],
		[20, 91],
		[27, 94],
		[36, 81],
		[44, 62]
	],
	[
		[64, 60],
		[71, 77],
		[80, 91],
		[73, 94],
		[64, 81],
		[56, 62]
	]
], Af = [
	[11, 72],
	[89, 72],
	[26, 85],
	[74, 85],
	[33, 72],
	[67, 72]
], jf = {
	behind: (e, t) => [
		...kf.map((e) => Y(e, "Body")),
		...Af.map(([e, t]) => X([
			[e, t - 1.8],
			[e + 1.8, t],
			[e, t + 1.8],
			[e - 1.8, t]
		], "Fin")),
		...Sd([Y([
			[77, 37],
			[95, 37],
			[95, 61],
			[77, 61]
		], "Stock"), ...yd(e, t, [81.6, 41.6], 5.6)], 14, [86, 50])
	],
	body: [Y(Of, "Body")],
	brows: {
		half: 6.5,
		y: 25
	},
	cheek: [68, 53],
	eyes: {
		left: 38,
		right: 62,
		size: 12.5,
		y: 37.5
	},
	fold: 30,
	front: yf,
	glasses: {
		height: 14,
		inner: 10,
		outer: 19,
		y: 35
	},
	hat: {
		tilt: 0,
		width: 36,
		x: 50,
		y: 8
	},
	mouth: {
		half: 8.5,
		wide: !1,
		x: 50,
		y: 52
	},
	neck: {
		left: 34,
		right: 66,
		sag: 6,
		y: 62
	},
	outline: [Of]
}, Mf = [
	[9, 34],
	[20, 20],
	[80, 20],
	[91, 34],
	[91, 56],
	[77, 70],
	[23, 70],
	[9, 56]
], Nf = {
	behind: () => Sf([
		[14, 55],
		[1, 67],
		[6, 73],
		[20, 64]
	]),
	body: [
		Y(Mf, "Body"),
		X([
			[22, 60],
			[78, 58],
			[77, 60.6],
			[23, 62.6]
		], "Stock"),
		X([
			[28, 65],
			[72, 63.6],
			[71, 66.2],
			[29, 67.4]
		], "Stock")
	],
	brows: {
		half: 6.5,
		y: 37.5
	},
	cheek: [50, 31],
	eyes: {
		left: 26,
		right: 74,
		size: 9.5,
		y: 47
	},
	fold: 38,
	front: (e, t) => Sd([Y([
		[8, 13],
		[24, 13],
		[24, 33],
		[8, 33]
	], "Stock"), ...yd(e, t, [12.4, 17.6], 5)], -14, [16, 24]),
	glasses: {
		height: 13,
		inner: 21,
		outer: 18,
		y: 46
	},
	hat: {
		tilt: 0,
		width: 50,
		x: 50,
		y: 21
	},
	mouth: {
		half: 34,
		wide: !0,
		x: 50,
		y: 54
	},
	neck: {
		left: 26,
		right: 74,
		sag: 6,
		y: 70
	},
	outline: [Mf]
}, Pf = [
	[2, 28],
	[9, 17],
	[50, 11],
	[91, 17],
	[98, 28],
	[94, 38],
	[70, 42],
	[63, 53],
	[37, 53],
	[30, 42],
	[6, 38]
], Ff = {
	behind: (e, t) => [...bf(e, t, -2), ...Sf([
		[24, 59],
		[7, 67],
		[12, 73],
		[28, 67]
	])],
	body: [
		Y([
			[25, 46],
			[75, 46],
			[81, 58],
			[70, 72],
			[30, 72],
			[19, 58]
		], "Body"),
		Y([
			[25, 57],
			[75, 57],
			[69, 75],
			[31, 75]
		], "Stock"),
		Y(Pf, "Body")
	],
	brows: {
		half: 5.5,
		y: 20.5
	},
	cheek: [72, 31],
	eyes: {
		left: 11,
		right: 89,
		size: 8,
		y: 28
	},
	fold: 36,
	front: yf,
	glasses: {
		height: 12,
		inner: 9,
		outer: 9,
		y: 27
	},
	hat: {
		tilt: 0,
		width: 38,
		x: 50,
		y: 14
	},
	mouth: {
		half: 13,
		wide: !1,
		x: 50,
		y: 64
	},
	neck: {
		left: 32,
		right: 68,
		sag: 7,
		y: 72
	},
	outline: [Pf, [
		[41, 20],
		[57, -3],
		[65, 20]
	]]
}, If = [
	[19, 38],
	[31, 21],
	[50, 15],
	[69, 21],
	[81, 38],
	[82, 55],
	[70, 70],
	[50, 76],
	[30, 70],
	[18, 55]
], Lf = [
	[-162, 13],
	[-132, 13],
	[-104, 12],
	[-48, 13],
	[-18, 13],
	[12, 13],
	[40, 11],
	[140, 11],
	[168, 13]
], Rf = (e, t) => [50 + t * Math.cos(e * Math.PI / 180), 46 + t * .94 * Math.sin(e * Math.PI / 180)], zf = (e, t) => Y([
	Rf(e - 9, 28),
	Rf(e, 30 + t),
	Rf(e + 9, 28)
], "Fin"), Bf = {
	behind: (e, t) => [...Lf.map(([e, t]) => zf(e, t)), ...xf(e, t, [52, 1], 10)],
	body: [Y(If, "Body"), Y([
		[26, 58],
		[50, 63],
		[74, 58],
		[69, 71],
		[50, 78],
		[31, 71]
	], "Stock")],
	brows: {
		half: 6.5,
		y: 25
	},
	cheek: [73, 49],
	eyes: {
		left: 36,
		right: 64,
		size: 12,
		y: 38
	},
	fold: 33,
	front: yf,
	glasses: {
		height: 15,
		inner: 12,
		outer: 18,
		y: 34
	},
	hat: {
		tilt: 0,
		width: 38,
		x: 50,
		y: 18
	},
	mouth: {
		half: 8,
		wide: !1,
		x: 50,
		y: 54
	},
	neck: {
		left: 32,
		right: 68,
		sag: 6,
		y: 73
	},
	outline: [If]
}, Vf = [
	[21, 42],
	[28, 21],
	[50, 12],
	[72, 21],
	[79, 42],
	[76, 56],
	[24, 56]
], Hf = [
	[38, 17],
	[54, -1],
	[66, 3],
	[63, 18]
], Uf = (e, t, n) => Y([
	[e - n * .5, t],
	[e + n * .5, t - .3],
	[e, t - n]
], "Stock"), Wf = {
	behind: (e, t) => [
		Y(Hf, "Fin"),
		...xf(e, t, [70, 13], 14),
		Y([
			[20, 56],
			[6, 51],
			[9, 61],
			[21, 66]
		], "Fin"),
		Y([
			[80, 56],
			[94, 51],
			[91, 61],
			[79, 66]
		], "Fin")
	],
	body: [
		Y(Vf, "Body"),
		Y([
			[14, 50],
			[86, 48],
			[82, 64],
			[67, 77],
			[33, 77],
			[18, 64]
		], "Body"),
		Uf(29, 52.6, 7),
		Uf(39.5, 52.4, 7),
		Uf(60.5, 52.2, 7),
		Uf(71, 52, 7)
	],
	brows: {
		half: 7,
		y: 24.5
	},
	cheek: [70, 43],
	eyes: {
		left: 37,
		right: 63,
		size: 9,
		y: 32
	},
	fold: 33,
	front: yf,
	glasses: {
		height: 13,
		inner: 11,
		outer: 19,
		y: 30
	},
	hat: {
		tilt: 0,
		width: 36,
		x: 50,
		y: 15
	},
	mouth: {
		half: 14,
		wide: !1,
		x: 50,
		y: 50
	},
	neck: {
		left: 34,
		right: 66,
		sag: 6,
		y: 76
	},
	outline: [Vf, Hf]
}, Gf = [
	[10, 44],
	[20, 24],
	[40, 15],
	[60, 15],
	[80, 24],
	[90, 44],
	[88, 60],
	[74, 72],
	[26, 72],
	[12, 60]
], Kf = {
	Angler: {
		behind: () => Sf([
			[15, 55],
			[1, 61],
			[5, 70],
			[17, 64]
		]),
		body: [Y(Gf, "Body"), ...[
			31,
			38,
			45,
			55,
			62,
			69
		].map((e) => Uf(e, 64, 4.6))],
		brows: {
			half: 6,
			y: 27
		},
		cheek: [77, 45],
		eyes: {
			left: 37,
			right: 63,
			size: 8,
			y: 34
		},
		fold: 32,
		front: (e, t) => [
			Y([
				[46.6, 17],
				[47.6, 5],
				[55, -4.6],
				[66, -8],
				[76, -5],
				[80.2, 1.6],
				[77, 2.4],
				[73.6, -1.6],
				[65.6, -4.6],
				[57.4, -1.4],
				[51.6, 17]
			], "Body"),
			...Sd([Y([
				[71.5, 6],
				[84.5, 6],
				[84.5, 23],
				[71.5, 23]
			], "Stock"), ...yd(e, t, [75.4, 10], 4.6)], 6, [78, 6]),
			Y(q([78.6, 3.6], 2.8), "Gold")
		],
		glasses: {
			height: 13,
			inner: 11,
			outer: 18,
			y: 31
		},
		hat: {
			tilt: -4,
			width: 38,
			x: 44,
			y: 16
		},
		mouth: {
			half: 24,
			wide: !1,
			x: 50,
			y: 59
		},
		neck: {
			left: 30,
			right: 70,
			sag: 6,
			y: 72
		},
		outline: [Gf]
	},
	Goldfish: Df,
	GreatWhite: wf,
	Hammerhead: Ff,
	Octopus: jf,
	Piranha: Wf,
	Puffer: Bf,
	Whale: Nf
}, qf = {
	Gutted: -9,
	Thinking: 6
}, Jf = 5.5, Yf = (e, t) => e === "Shades" && t !== "LookingDown", Xf = (e, t, n) => t === "LookingDown" ? wd(e, 0, Jf) : Sd(e, qf[t] ?? 0, n), Zf = (e, t, n) => {
	let { left: r, right: i } = e, { height: a, inner: o, outer: s, y: c } = t, l = n === "Happy" ? [X([
		[r - 9, c + 10],
		[r - 2, c + 3],
		[r + .4, c + 3],
		[r - 6.6, c + 10]
	], "Stock"), X([
		[i - 7, c + 10],
		[i, c + 3],
		[i + 2.4, c + 3],
		[i - 4.6, c + 10]
	], "Stock")] : [];
	return [
		Y([
			[r - s, c - 1],
			[r + o, c + 1],
			[r + o - 2, c + a],
			[r - s + 6, c + a - 1]
		], "Ink"),
		Y([
			[i - o, c + 1],
			[i + s, c - 2],
			[i + s - 6, c + a - 1],
			[i - o + 2, c + a]
		], "Ink"),
		X([
			[r + o - 3, c + 1.6],
			[i - o + 3, c + 1.6],
			[i - o + 3, c + 4.4],
			[r + o - 3, c + 4.4]
		], "Ink"),
		...l
	];
}, Qf = (e) => {
	let { left: t, right: n, size: r, y: i } = e, a = r * .98, o = r * .74;
	return [
		hd(q([t, i], a), q([t, i], o), "Gold"),
		hd(q([n, i], a), q([n, i], o), "Gold"),
		X(J([t + a - .6, i - r * .2], [n - a + .6, i - r * .2], 1.8), "Gold")
	];
}, $f = (e) => {
	let { right: t, size: n, y: r } = e, i = n * 1.02, a = [t + i * .62, r + i * .72];
	return [...Array.from({ length: 5 }, (e, t) => X(q([a[0] + t * 1.7, a[1] + t * 3.4 + t * t * .3], .95), "Gold")), hd(q([t, r], i), q([t, r], n * .78), "Gold")];
}, ep = (e, t) => {
	let { left: n, right: r, size: i, y: a } = e;
	return [X(J([n - i * 1.1, a + i * .15], [n + (r - n) * .62, t], 1.7), "Ink"), Y([
		[n - i * .86, a - i * .5],
		[n - i * .1, a - i * .86],
		[n + i * .84, a - i * .52],
		[n + i * .8, a + i * .42],
		[n + i * .06, a + i * .82],
		[n - i * .8, a + i * .5]
	], "Ink")];
}, tp = (e, t, n, r, i) => {
	if (t === "Folded" || e === "None") return [];
	let a = [(n.left + n.right) / 2, r.y + 6];
	return e === "Shades" ? Xf(Zf(n, r, t), t, a) : e === "Round" ? Xf(Qf(n), t, a) : e === "Monocle" ? Xf($f(n), t === "LookingDown" ? "Resting" : t, a) : ep(n, i);
}, np = (e, t) => {
	let { left: n, right: r, sag: i, y: a } = t, o = (n + r) / 2, s = a + i - 1;
	return [
		...Array.from({ length: 9 }, (e, t) => {
			let o = t / 8, s = n + o * (r - n), c = a + Math.sin(o * Math.PI) * i, l = [
				[s - 2.8, c],
				[s, c - 2.4],
				[s + 2.8, c],
				[s, c + 2.4]
			];
			return t === 0 ? Y(l, "Gold") : X(l, "Gold");
		}),
		Y([
			[o - 4.5, s],
			[o + 4.5, s],
			[o + 4.5, s + 9],
			[o - 4.5, s + 9]
		], "Gold"),
		gd(e, [o, s + 4.6], 6.4, vd(e))
	];
}, rp = (e) => {
	let t = (e.left + e.right) / 2, n = e.y + 1.5;
	return [
		Y([
			[t - 1, n + 1],
			[t - 11.5, n - 4.6],
			[t - 10.4, n + 10],
			[t - 1, n + 5]
		], "Ink", "Accent"),
		Y([
			[t + 1, n + 1],
			[t + 11.5, n - 4.6],
			[t + 10.4, n + 10],
			[t + 1, n + 5]
		], "Ink", "Accent"),
		Y([
			[t - 3, n - .6],
			[t + 3, n - .6],
			[t + 2.6, n + 6.6],
			[t - 2.6, n + 6.6]
		], "Gold", "Accent")
	];
}, ip = (e, t) => {
	let { left: n, right: r, y: i } = t, a = (n + r) / 2, o = [a, i + 6.5];
	return [
		X(J([a - 9, i - 2], o, 2.2), "Ink"),
		X(J([a + 9, i - 2], o, 2.2), "Ink"),
		X(J([a - 1.6, o[1]], [a - 3, o[1] + 13], 2), "Ink"),
		X(J([a + 1.6, o[1]], [a + 3.2, o[1] + 12], 2), "Ink"),
		Y(J([a - 3, o[1] + 11.5], [a - 3.2, o[1] + 15.5], 3), "Gold"),
		Y(J([a + 3.2, o[1] + 10.5], [a + 3.4, o[1] + 14.5], 3), "Gold"),
		Y(q(o, 6), "Gold"),
		gd(e, o, 6.4, vd(e))
	];
}, ap = (e, t, n) => e === "Chain" ? np(t, n) : e === "BowTie" ? rp(n) : e === "Bolo" ? ip(t, n) : [], op = {
	behind: [],
	front: []
}, sp = (e) => (t, n, r) => Y(t.map(([t, n]) => [e.x + t * e.width, e.y + n * e.width]), n, r), cp = (e) => (t, n, r, i) => gd(t, [e.x + n[0] * e.width, e.y + n[1] * e.width], r * e.width, i), lp = (e) => (t, n) => X(t.map(([t, n]) => [e.x + t * e.width, e.y + n * e.width]), n), up = {
	Cowboy: -3,
	Fedora: -7
}, dp = (e, t, n) => {
	let r = sp(t), i = lp(t), a = cp(t);
	return e === "Crown" ? {
		behind: [r([
			[-.46, .1],
			[-.5, -.38],
			[-.27, -.18],
			[-.12, -.42],
			[0, -.22],
			[.12, -.42],
			[.27, -.18],
			[.5, -.38],
			[.46, .1]
		], "Gold", "Gold"), a(n, [0, -.14], .15, vd(n))],
		front: []
	} : e === "Cowboy" ? {
		behind: [],
		front: [
			r([
				[-.36, .02],
				[-.33, -.36],
				[-.24, -.5],
				[-.08, -.52],
				[0, -.43],
				[.08, -.52],
				[.24, -.5],
				[.33, -.36],
				[.36, .02]
			], "Ink", "Gold"),
			i([
				[-.35, -.13],
				[.35, -.13],
				[.36, -.03],
				[-.36, -.03]
			], "Ink"),
			r([
				[-.98, -.18],
				[-.78, -.03],
				[-.42, .03],
				[.42, .03],
				[.78, -.03],
				[.98, -.18],
				[.86, .06],
				[.5, .15],
				[-.5, .15],
				[-.86, .06]
			], "Ink", "Gold")
		]
	} : e === "Fedora" ? {
		behind: [],
		front: [
			r([
				[-.37, .02],
				[-.35, -.34],
				[-.23, -.5],
				[-.05, -.48],
				[0, -.4],
				[.05, -.48],
				[.23, -.5],
				[.35, -.34],
				[.37, .02]
			], "Ink", "Ink"),
			i([
				[-.365, -.15],
				[.365, -.15],
				[.37, -.02],
				[-.37, -.02]
			], "Accent"),
			r([
				[-.74, -.01],
				[-.44, -.06],
				[.44, -.06],
				[.74, -.03],
				[.64, .09],
				[-.66, .11]
			], "Ink", "Ink")
		]
	} : e === "Visor" ? {
		behind: [],
		front: [i([
			[-.52, -.08],
			[.52, -.08],
			[.52, .01],
			[-.52, .01]
		], "Ink"), r([
			[-.6, -.04],
			[.6, -.04],
			[.7, .2],
			[.32, .27],
			[-.32, .27],
			[-.7, .2]
		], "Ink", "Green")]
	} : e === "Bandana" ? {
		behind: [],
		front: [
			r([
				[.44, -.04],
				[.74, .08],
				[.66, .2],
				[.42, .08]
			], "Ink", "Accent"),
			r([
				[.44, -.02],
				[.6, .26],
				[.48, .32],
				[.38, .06]
			], "Ink", "Accent"),
			r([
				[-.55, .06],
				[-.47, -.2],
				[-.2, -.34],
				[.2, -.34],
				[.47, -.2],
				[.55, .06],
				[.2, .01],
				[-.2, .01]
			], "Ink", "Accent"),
			a(n, [-.24, -.15], .1, "Stock"),
			a(n, [.04, -.21], .1, "Stock"),
			a(n, [.3, -.12], .1, "Stock")
		]
	} : e === "Cap" ? {
		behind: [],
		front: [
			r([
				[-.46, .04],
				[-.42, -.22],
				[-.2, -.38],
				[.2, -.38],
				[.42, -.22],
				[.46, .04]
			], "Ink", "Fin"),
			a(n, [0, -.17], .15, vd(n)),
			r([
				[-.5, 0],
				[.5, 0],
				[.62, .1],
				[.3, .17],
				[-.3, .17],
				[-.62, .1]
			], "Ink", "Ink")
		]
	} : op;
}, fp = (e, t, n) => {
	let r = dp(e, t, n), i = t.tilt + (up[e] ?? 0), a = [t.x, t.y];
	return {
		behind: Sd(r.behind, i, a),
		front: Sd(r.front, i, a)
	};
}, pp = (e, t, n) => {
	if (e === "None" || t === "Happy") return [];
	let r = n.x + n.half * .78, i = n.y + .6;
	if (e === "Toothpick") return [Y([
		[r - 1, i - .4],
		[r + 14, i + 3.2],
		[r + 13.6, i + 4.6],
		[r - 1.2, i + 1.2]
	], "Stock")];
	let a = [r + 3.2, i + 2];
	return [
		Y(q(a, 4.6), "Gold", "Accent"),
		...[
			0,
			3,
			6,
			9
		].map((e) => {
			let t = e * Math.PI / 6 + .3;
			return X(q([a[0] + 3.4 * Math.cos(t), a[1] + 3.4 * Math.sin(t)], .9), "Stock");
		}),
		X(q(a, 1.7), "Stock")
	];
}, mp = (e, t, n) => Sd([
	Y([
		[e, 70],
		[e + 17, 70],
		[e + 17, 95],
		[e, 95]
	], "Stock"),
	X([
		[e + 2.4, 72.4],
		[e + 14.6, 72.4],
		[e + 14.6, 92.6],
		[e + 2.4, 92.6]
	], "Ink"),
	gd(n, [e + 8.5, 82.5], 6, "Stock")
], t, [e + 8.5 - t * .1, 84]), hp = (e) => [...mp(33, -12, e), ...mp(50, 10, e)], gp = {
	Gutted: {
		dy: 1.2,
		rise: .7
	},
	Happy: {
		dy: -1.6,
		rise: 1.45
	}
}, _p = {
	dy: 0,
	rise: 1
}, vp = (e, t) => Cd(wd(e, 0, t.dy), t.rise), yp = (e, t) => e.eyewear === "Shades" && t === "LookingDown", bp = (e, t, n) => {
	let r = fp(e.headwear, n.hat, e.suit), i = gp[t] ?? _p, a = Yf(e.eyewear, t) ? [] : tf(e.eyes, e.suit, yp(e, t) ? "Resting" : t, n.eyes), o = yp(e, t) ? [] : af(t, n.eyes, n.brows);
	return [
		n.behind(e.rank, e.suit),
		r.behind,
		n.body,
		vf(e, n),
		n.front(e.rank, e.suit),
		vp(a, i),
		vp(o, i),
		vp(tp(e.eyewear, t, n.eyes, n.glasses, n.hat.y - 1), i),
		vp(ff(e.mouth, t, n.mouth), i),
		ap(e.neck, e.suit, n.neck),
		vp(r.front, i),
		vp(pp(e.extra, t, n.mouth), i),
		t === "LookingDown" ? hp(e.suit) : []
	];
}, xp = 1, Sp = 7, Cp = (e, t, n) => `${t.outline.map((e) => {
	let r = ud(e, t.fold);
	return r.points.length < 3 ? "" : Bd(od(r.points, Sp, r.pinned), zd("Stock", n), xp, n);
}).join("")}${Gd([gd(e.suit, [50, t.fold + 10], 12, vd(e.suit))], n)}`, wp = (e, t, n) => n && t !== "" ? `<g class="sheet" style="--sheet:${e}">${t}</g>` : t, Tp = (e, { expression: t, layers: n = !1, size: r, theme: i = "Light" }) => {
	let a = Kf[e.species], o = {
		pair: Hu[e.colour],
		px: r,
		theme: i
	}, s = t === "Folded", c = bp(e, t, a).map((e) => Gd(s ? Ed(e, a.fold) : e, o)), l = s ? [Cp(e, a, o)] : [], u = [...c, ...l].filter((e) => e !== "").map((e, t) => wp(t, e, n));
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${G(r)}" height="${G(r)}" overflow="visible">${u.join("")}</svg>`;
}, Ep = {
	close: !1,
	key: "species",
	label: "Fish",
	options: Ll
}, Dp = [
	Ep,
	{
		close: !1,
		key: "colour",
		label: "Colour",
		options: Rl
	},
	{
		close: !0,
		key: "suit",
		label: "Suit",
		options: zl
	},
	{
		close: !0,
		key: "rank",
		label: "Card",
		options: Bl
	},
	{
		close: !0,
		key: "eyes",
		label: "Eyes",
		options: Vl
	},
	{
		close: !0,
		key: "mouth",
		label: "Mouth",
		options: Hl
	},
	{
		close: !0,
		key: "headwear",
		label: "Hat",
		options: Ul
	},
	{
		close: !0,
		key: "eyewear",
		label: "Glasses",
		options: Wl
	},
	{
		close: !0,
		key: "neck",
		label: "Neck",
		options: Gl
	},
	{
		close: !0,
		key: "mark",
		label: "Mark",
		options: Kl
	},
	{
		close: !0,
		key: "extra",
		label: "Extra",
		options: ql
	}
], Op = (e) => Dp.find((t) => t.key === e) ?? Ep, kp = (e, t, n) => ({
	...e,
	[t]: n
}), Ap = (e) => e.replaceAll(/(?<=[a-z])(?=[A-Z])/gu, " ").toLowerCase(), jp = (e) => e.charAt(0).toUpperCase() + e.slice(1), Mp = (e, t) => t === "None" ? "None" : e === "colour" ? jp(Ap(t).replace(" ", " & ")) : e === "suit" ? `${t}s` : jp(Ap(t)), Z = (e, t = {}, ...n) => {
	let r = document.createElement(e);
	for (let [e, n] of Object.entries(t)) n === !0 ? r.setAttribute(e, "") : n !== !1 && n !== void 0 && r.setAttribute(e, String(n));
	for (let e of n) e !== null && e !== !1 && e !== void 0 && r.append(e);
	return r;
}, Np = new URLSearchParams(location.search), Pp = 2147483647, Fp = Number(Np.get("seed") ?? "0"), [Ip = 1] = crypto.getRandomValues(/* @__PURE__ */ new Uint32Array(1)), Lp = Number.isInteger(Fp) && Fp > 0 ? Fp : 1 + Ip % 2147483645, Rp = () => (Lp = (Lp * 48271 + 12345) % Pp, Lp), zp = () => matchMedia("(prefers-color-scheme: dark)").matches ? "Dark" : "Light", Bp = /* @__PURE__ */ new Map([["dark", "Dark"], ["light", "Light"]]), Q = {
	avatar: ku(Rp()),
	done: !1,
	expression: "Resting",
	past: [],
	preview: null,
	shuffled: !1,
	theme: Bp.get(Np.get("theme") ?? "") ?? zp()
}, Vp = () => Q.preview ?? Q.avatar, Hp = [], Up = (e) => {
	Hp.push(e);
}, $ = () => {
	document.documentElement.dataset.theme = Q.theme.toLowerCase();
	for (let e of Hp) e();
}, Wp = Z("div", {
	"aria-live": "polite",
	class: "sr-only"
}), Gp = (e) => {
	Wp.textContent = e;
}, Kp = (e, t) => Pu(e) === Pu(t), qp = (e, t = "") => {
	Q.preview = null, Kp(e, Q.avatar) || (Q.past = [...Q.past, Q.avatar].slice(-40), Q.avatar = e, t !== "" && Gp(t)), $();
}, Jp = (e, t) => {
	qp(kp(Q.avatar, e, t), `${Op(e).label}: ${Mp(e, t)}`);
}, Yp = () => {
	let e = Q.past.at(-1);
	e !== void 0 && (Q.past = Q.past.slice(0, -1), Q.avatar = e, Q.preview = null, Gp("Back to the face before"), $());
}, Xp = matchMedia("(prefers-reduced-motion: reduce)"), Zp = "cubic-bezier(0.2, 0.8, 0.2, 1)", Qp = 2, $p = -2.6, em = (e, t = 820, n = 18) => {
	if (!Xp.matches) for (let r of e.querySelectorAll("g.sheet")) {
		let e = Number(r.style.getPropertyValue("--sheet"));
		r.animate([
			{ transform: "translate(0px, 0px)" },
			{
				offset: .45,
				transform: `translate(${e * Qp}px, ${e * $p}px)`
			},
			{ transform: "translate(0px, 0px)" }
		], {
			delay: e * n,
			duration: t,
			easing: Zp
		});
	}
}, tm = () => {
	Q.shuffled = !0;
}, nm = () => {
	tm(), qp(ku(Rp()), "A new face");
}, rm = (e) => {
	e === null && Q.preview === null || e !== null && Q.preview !== null && Kp(e, Q.preview) || (Q.preview = e, $());
}, im = (e, t, n) => {
	e.dataset.key !== t && (e.dataset.key = t, e.innerHTML = n());
}, am = (e, t, n) => {
	let r = n.expression ?? "Resting", i = Math.round(n.size);
	im(e, `${Pu(t)}/${r}/${i}/${Q.theme}/${n.layers === !0}`, () => `<span class="full">${Tp(t, {
		expression: r,
		layers: n.layers === !0,
		size: i,
		theme: Q.theme
	})}</span>`);
}, om = {
	h: 100,
	w: 100,
	x: 0,
	y: 0
}, sm = Z("div", {
	"aria-hidden": "true",
	class: "bench"
}), cm = (e) => ({
	colour: "BlueYellow",
	extra: "None",
	eyes: "Pips",
	eyewear: "None",
	headwear: "None",
	mark: "None",
	mouth: "Line",
	neck: "None",
	rank: "Ace",
	species: e,
	suit: "Spade"
}), lm = (e, t = "Resting") => {
	sm.isConnected || document.body.append(sm), sm.innerHTML = Tp(e, {
		expression: t,
		layers: !0,
		size: 100,
		theme: "Light"
	});
	let n = sm.firstElementChild?.getBoundingClientRect(), r = /* @__PURE__ */ new Map();
	for (let e of sm.querySelectorAll("g.sheet > *")) {
		let t = e.getBoundingClientRect();
		r.set(e.outerHTML, {
			h: t.height,
			w: t.width,
			x: t.left - (n?.left ?? 0),
			y: t.top - (n?.top ?? 0)
		});
	}
	return r;
}, um = (e) => {
	if (e.length === 0) return om;
	let t = Math.min(...e.map((e) => e.x)), n = Math.min(...e.map((e) => e.y)), r = Math.max(...e.map((e) => e.x + e.w));
	return {
		h: Math.max(...e.map((e) => e.y + e.h)) - n,
		w: r - t,
		x: t,
		y: n
	};
}, dm = /* @__PURE__ */ new Map(), fm = { suit: "rank" }, pm = /* @__PURE__ */ new Set(["mark"]), mm = (e, t) => {
	let { options: n } = Op(t), r = n.map((n) => lm(kp(cm(e), t, n))), i = r.map((e) => [...e].flatMap(([e, t]) => r.every((t) => t.has(e)) ? [] : [t])), a = um(i.flat());
	dm.set(`${e}/${t}`, a);
	for (let [r, o] of n.entries()) {
		let n = i[r] ?? [];
		dm.set(`${e}/${t}/${o}`, n.length === 0 || !pm.has(t) ? a : um(n));
	}
}, hm = (e, t, n = "") => {
	let r = fm[t] ?? t;
	if (r === "species" || r === "colour") return om;
	let i = n === "" || r !== t ? `${e}/${r}` : `${e}/${r}/${n}`;
	return dm.has(i) || mm(e, r), dm.get(i) ?? om;
}, gm = {
	extra: {
		least: 34,
		pad: 5
	},
	eyes: {
		least: 30,
		pad: 5
	},
	eyewear: {
		least: 40,
		pad: 4
	},
	headwear: {
		least: 50,
		pad: 4
	},
	mark: {
		least: 46,
		pad: 4
	},
	mouth: {
		least: 34,
		pad: 5
	},
	neck: {
		least: 40,
		pad: 5
	},
	rank: {
		centred: !0,
		least: 26,
		pad: 4
	},
	suit: {
		centred: !0,
		least: 26,
		pad: 4
	}
}, _m = {
	least: 100,
	pad: 0
}, vm = 50, ym = (e, t, n) => {
	let r = Math.max(0, (n - t) / 2);
	return Math.min(Math.max(vm, e - r), e + r);
}, bm = (e, t, n, r) => {
	let i = hm(e.species, t, e[t]), a = gm[t] ?? _m, o = t === "mark" ? {
		...a,
		least: Math.min(a.least, Math.max(28, n / 1.6))
	} : a, s = i.w + o.pad * 2, c = i.h + o.pad * 2, l = Math.max(Math.min(n / Math.max(s, o.least), r / Math.max(c, o.least)), n / 104), u = o.centred === !0 ? Infinity : 0, d = ym(i.x + i.w / 2, Math.max(s, o.least, u), n / l), f = ym(i.y + i.h / 2, Math.max(c, o.least, u), r / l);
	return {
		left: n / 2 - d * l,
		size: Math.round(l * 100),
		top: r / 2 - f * l
	};
}, xm = (e, t, n, r = "Resting") => {
	let i = e.getBoundingClientRect(), a = Math.round(i.width), o = Math.round(i.height);
	if (a === 0 || o === 0) return;
	let { left: s, size: c, top: l } = bm(t, n, a, o);
	im(e, `${Pu(t)}/${n}/${r}/${a}x${o}/${Q.theme}`, () => `<span class="crop" style="width:${c}px;height:${c}px;left:${s.toFixed(1)}px;top:${l.toFixed(1)}px">${Tp(t, {
		expression: r,
		size: c,
		theme: Q.theme
	})}</span>`);
}, Sm = (e, t) => t === "eyes" && e.eyewear === "Shades" ? {
	...e,
	eyewear: "None"
} : e, Cm = (e, t, n) => {
	if (Op(n).close) xm(e, Sm(t, n), n);
	else {
		let n = e.getBoundingClientRect();
		am(e, t, { size: Math.min(n.width, n.height) });
	}
}, wm = (e, t) => (e + 1) % t, Tm = (e, t) => (e - 1 + t) % t, Em = /* @__PURE__ */ new Map([
	["ArrowRight", wm],
	["ArrowDown", wm],
	["ArrowLeft", Tm],
	["ArrowUp", Tm],
	["Home", () => 0],
	["End", (e, t) => t - 1]
]), Dm = (e, t) => {
	e.addEventListener("keydown", (n) => {
		let r = [...e.querySelectorAll(t)], i = r.findIndex((e) => e.matches(":focus")), a = Em.get(n.key);
		if (i === -1 || a === void 0) return;
		let o = r[a(i, r.length)];
		n.preventDefault(), o?.focus(), o?.click();
	});
}, Om = matchMedia("(hover: hover) and (pointer: fine)"), km = (e, t = {}) => {
	let n = e.options.map((t) => {
		let n = Z("span", {
			"aria-hidden": "true",
			class: "tile-art"
		});
		return {
			art: n,
			button: Z("button", {
				"aria-label": Mp(e.key, t),
				class: "tile",
				"data-option": t,
				role: "radio",
				title: Mp(e.key, t),
				type: "button"
			}, n),
			option: t
		};
	}), r = Z("span", { class: "group-picked" }), i = Z("div", {
		"aria-label": e.label,
		class: "tiles",
		role: "radiogroup"
	}, ...n.map((e) => e.button)), a = Z("section", {
		class: "group",
		"data-part": e.key
	}, Z("h3", { class: "group-label" }, e.label, r), i), o = (t) => kp(Q.avatar, e.key, t);
	for (let { button: r, option: i } of n) r.addEventListener("click", () => {
		Jp(e.key, i);
	}), t.previews === !0 && (r.addEventListener("pointerenter", (e) => {
		e.pointerType === "mouse" && Om.matches && rm(o(i));
	}), r.addEventListener("pointerleave", () => {
		rm(null);
	}));
	return Dm(i, ".tile"), Up(() => {
		if (a.offsetParent !== null) {
			r.textContent = Mp(e.key, Q.avatar[e.key]);
			for (let { art: t, button: r, option: i } of n) {
				let n = Q.avatar[e.key] === i;
				r.setAttribute("aria-checked", String(n)), r.tabIndex = n ? 0 : -1, Cm(t, o(i), e.key);
			}
		}
	}), a;
}, Am = (e = {}) => Z("div", { class: "wall" }, ...Dp.map((t) => km(t, e))), jm = () => {
	let e = Z("span", { class: "big-art" }), t = Z("div", {
		"aria-label": "Your face",
		class: "big",
		role: "img"
	}, e);
	return Up(() => {
		let n = t.getBoundingClientRect().width;
		if (n !== 0) {
			if (t.classList.toggle("is-trying", Q.preview !== null), t.dataset.kept !== Pu(Q.avatar)) {
				let e = t.dataset.kept === void 0;
				t.dataset.kept = Pu(Q.avatar), e || (t.classList.remove("is-changed"), t.offsetWidth, t.classList.add("is-changed"));
			}
			am(e, Vp(), {
				expression: Q.expression,
				layers: !0,
				size: n
			}), Q.shuffled && (Q.shuffled = !1, em(e));
		}
	}), t;
}, Mm = [
	{
		expression: "Resting",
		label: "Waiting"
	},
	{
		expression: "LookingDown",
		label: "Peeking"
	},
	{
		expression: "Thinking",
		label: "Thinking"
	},
	{
		expression: "Happy",
		label: "Won"
	},
	{
		expression: "Gutted",
		label: "Lost"
	},
	{
		expression: "Folded",
		label: "Folded"
	}
], Nm = () => {
	let e = Z("span", { class: "mirror-mood" }), t = Mm.map(({ expression: e, label: t }) => {
		let n = Z("span", {
			"aria-hidden": "true",
			class: "mirror-art"
		});
		return {
			art: n,
			button: Z("button", {
				"aria-label": t,
				class: "mirror-face",
				"data-mood": e,
				title: t,
				type: "button"
			}, n),
			expression: e
		};
	});
	for (let { button: e, expression: n } of t) {
		let t = () => {
			Q.expression = n, $();
		};
		e.addEventListener("click", t), e.addEventListener("pointerenter", (e) => {
			e.pointerType === "mouse" && Om.matches && t();
		}), e.addEventListener("pointerleave", (e) => {
			e.pointerType === "mouse" && Om.matches && (Q.expression = "Resting", $());
		});
	}
	let n = Z("div", {
		"aria-label": "At the table",
		class: "mirror-row",
		role: "group"
	}, ...t.map((e) => e.button));
	Dm(n, ".mirror-face");
	let r = Z("div", { class: "mirror" }, Z("p", { class: "mirror-label" }, "At the table", e), n);
	return Up(() => {
		let n = Mm.find((e) => e.expression === Q.expression);
		e.textContent = n?.label ?? "";
		for (let { art: e, button: n, expression: r } of t) {
			let t = e.getBoundingClientRect().width, i = r === Q.expression;
			n.setAttribute("aria-pressed", String(i)), n.tabIndex = i ? 0 : -1, t > 0 && am(e, Vp(), {
				expression: r,
				size: t
			});
		}
	}), r;
}, Pm = "<svg viewBox=\"0 0 20 20\" width=\"18\" height=\"18\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M7 4L3 8l4 4\"/><path d=\"M3 8h8.5a5 5 0 0 1 0 10H8\"/></svg>", Fm = "<svg viewBox=\"0 0 20 20\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" aria-hidden=\"true\"><circle cx=\"10\" cy=\"10\" r=\"3.5\"/><path d=\"M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4\"/></svg>", Im = "<svg viewBox=\"0 0 20 20\" width=\"20\" height=\"20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z\"/></svg>", Lm = () => {
	let e = Z("span", {
		"aria-hidden": "true",
		class: "undo-art"
	}), t = Z("span", {
		"aria-hidden": "true",
		class: "undo-icon"
	});
	t.innerHTML = Pm;
	let n = Z("button", {
		"aria-keyshortcuts": "Z",
		"aria-label": "Back to the face before",
		class: "button undo",
		title: "Back to the face before (Z)",
		type: "button"
	}, e, t);
	return n.addEventListener("click", Yp), Up(() => {
		let t = Q.past.at(-1);
		n.disabled = t === void 0, t === void 0 ? (delete e.dataset.key, e.innerHTML = "") : am(e, t, { size: 36 });
	}), n;
}, Rm = (e = "Shuffle", t = nm) => {
	let n = Z("button", {
		"aria-keyshortcuts": "S",
		class: "button shuffle",
		title: `${e} (S)`,
		type: "button"
	}, e);
	return n.addEventListener("click", t), n;
}, zm = () => {
	let e = Z("button", {
		"aria-label": "Switch theme",
		class: "theme-switch",
		title: "Switch theme",
		type: "button"
	});
	return e.addEventListener("click", () => {
		Q.theme = Q.theme === "Light" ? "Dark" : "Light", $();
	}), Up(() => {
		e.innerHTML = Q.theme === "Light" ? Im : Fm;
	}), e;
}, Bm = () => {
	let e = Z("button", {
		class: "button primary done-button",
		type: "button"
	}, "Done");
	return e.addEventListener("click", () => {
		Q.done = !0, Q.preview = null, Q.expression = "Resting", Gp("Face kept"), $();
	}), e;
}, Vm = () => {
	let e = Z("span", {
		"aria-hidden": "true",
		class: "kept-art"
	}), t = Z("span", {
		"aria-hidden": "true",
		class: "kept-seat"
	}), n = Z("button", {
		class: "button",
		type: "button"
	}, "Keep changing"), r = Z("div", {
		class: "kept",
		hidden: !0
	}, Z("section", {
		"aria-label": "Face kept",
		"aria-modal": "true",
		class: "kept-panel",
		role: "dialog"
	}, e, Z("p", { class: "kept-title" }, "That's you."), Z("div", { class: "kept-table" }, t, Z("span", {}, "At the table")), n));
	return n.addEventListener("click", () => {
		Q.done = !1, $();
	}), Up(() => {
		let i = r.hasAttribute("hidden") && Q.done;
		r.toggleAttribute("hidden", !Q.done), Q.done && (am(e, Q.avatar, {
			expression: "Happy",
			layers: !0,
			size: 176
		}), am(t, Q.avatar, { size: 48 })), i && n.focus();
	}), r;
};
((e, t = {}) => {
	document.querySelector("#app")?.append(e, Vm(), Wp), document.body.append(sm), document.addEventListener("keydown", (e) => {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key === "Escape" && Q.done) {
			Q.done = !1, $();
			return;
		}
		let n = {
			z: Yp,
			...t
		}[e.key.toLowerCase()];
		n !== void 0 && !Q.done && (e.preventDefault(), n());
	});
	let n = 0;
	addEventListener("resize", () => {
		cancelAnimationFrame(n), n = requestAnimationFrame($);
	}), $(), requestAnimationFrame($), document.fonts.addEventListener("loadingdone", $);
})(Z("div", { class: "a-page" }, Z("header", { class: "stage" }, jm(), Nm()), Z("main", { class: "a-wall wall-box" }, Am({ previews: !0 })), Z("footer", { class: "foot bar" }, Lm(), Rm(), zm(), Bm())), { s: nm });
