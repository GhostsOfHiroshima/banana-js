"use strict";
function _assert(state, msg) {
    if (!state) {
        throw msg;
    }
}
class Optional {
    constructor(value) {
        this.value = value;
    }
    static of(v) {
        /** 可傳入 v:U 或 null 或 undefined */
        return new Optional(v);
    }
    static empty() {
        return new Optional(null);
    }
    jsonable(transformer) {
        return this.value == null ? null : transformer(this.value);
    }
    static restore(data, transformer) {
        return Optional.of(data).map(transformer);
    }
    is_present() {
        return this.value !== null && this.value !== undefined;
    }
    get() {
        _assert(this.is_present(), "NULL ERROR!!");
        return this.value;
    }
    or_else(others) {
        return this.is_present() ? this.value : others;
    }
    or_exec(func) {
        // 無論 Optional 是否有值，or_else 裡面的表達式都會被求值
        // 例如: doc.or_else(load_default()) 不論 doc 是否有值，load_default 都會執行
        // 如果不希望 or_else 裡面的表達式被無謂求值，就用 or_exec
        return this.is_present() ? this.value : func();
    }
    or_fail(error) {
        return this.is_present() ? Result.ok(this.value) : Result.fail(error);
    }
    map(f) {
        return this.is_present() ? Optional.of(f(this.value)) : Optional.empty();
    }
    if_present(f) {
        // something.if_present 跟 something.map 的作用一樣，但提供比較清楚的語意
        // 讓使用者不用再寫 if (xxx.is_present()) { xxx.get() } 的程式碼
        return this.map(f);
    }
    chain(f) {
        return this.is_present() ? f(this.value) : Optional.empty();
    }
    static cat(list) {
        return list.filter(i => i.is_present()).map(i => i.get());
    }
}
exports.Optional = Optional;
class Result {
    constructor(ok, error, value) {
        this.ok = ok;
        this.value = value;
        this.error = error;
    }
    static ok(v) {
        return new Result(true, null, v);
    }
    static fail(e) {
        return new Result(false, e, null);
    }
    jsonable(errorT, valueT) {
        if (this.ok) {
            return [null, valueT(this.value)];
        }
        else {
            return [errorT(this.error), null];
        }
    }
    static restore(data, errorT, valueT) {
        if (data[0] === null) {
            return Result.ok(valueT(data[1]));
        }
        else {
            return Result.fail(errorT(data[0]));
        }
    }
    map(f) {
        if (this.ok) {
            return Result.ok(f(this.value));
        }
        else {
            return Result.fail(this.error);
        }
    }
    chain(f) {
        if (this.ok) {
            return f(this.value);
        }
        else {
            return Result.fail(this.error);
        }
    }
    if_ok(f) {
        // result.if_ok 跟 result.map 的作用一樣，但提供比較清楚的語意
        // 讓使用者不用再寫 if (xxx.ok) { xxx.get() } 的程式碼
        return this.map(f);
    }
    if_error(f) {
        if (this.ok) {
            return Result.ok(this.value);
        }
        else {
            return Result.fail(f(this.error));
        }
    }
    get fail() {
        return !this.ok;
    }
    get() {
        _assert(this.ok, "Result 不 ok");
        return this.value;
    }
    get_error() {
        _assert(!this.ok, "Result 不 fail");
        return this.error;
    }
    either(f, g) {
        if (this.ok) {
            return g(this.value);
        }
        else {
            return f(this.error);
        }
    }
    static cat(list) {
        return list.filter(r => r.ok).map(r => r.get());
    }
}
exports.Result = Result;
class List extends Array {
    static of(data) {
        let res = new List();
        if (data instanceof Array) {
            data.forEach(i => res.push(i));
        }
        else if (data instanceof Set) {
            Array.from(data.values()).forEach(i => res.push(i));
        }
        else {
            throw 'List.of 只接受 Array, Set 類型的參數';
        }
        return res;
    }
    chain(f) {
        function flatten(listOfList) {
            let res = [];
            listOfList.forEach(list => list.forEach(i => res.push(i)));
            return res;
        }
        return List.of(flatten(this.map(f)));
    }
}
exports.List = List;
class IO {
    constructor(data) {
        this.exec = data;
    }
    static of(res) {
        return new IO(() => res);
    }
    map(f) {
        return new IO(() => f(this.exec()));
    }
    chain(f) {
        let o = new IO(() => f(this.exec()));
        return o.exec();
    }
}
exports.IO = IO;
function makePromise(data) {
    return new Promise((resolve, reject) => resolve(data));
}
exports.makePromise = makePromise;
class PromiseOptional {
    constructor(data) {
        this.data = data;
    }
    static make(data) {
        if (data instanceof Optional) {
            return new PromiseOptional(makePromise(data));
        }
        else {
            return new PromiseOptional(data);
        }
    }
    map(f) {
        return new PromiseOptional(this.data.then(d => d.map(f)));
    }
    chain(f) {
        function mapper(p) {
            let res = f(p);
            if (res instanceof PromiseOptional) {
                return res.data;
            }
            else {
                return res;
            }
        }
        let res = this.data.then(d => d.map(mapper)
            .or_else(makePromise(Optional.empty())));
        return new PromiseOptional(res);
    }
    or_else(other) {
        return this.data.then(d => d.is_present() ? d.get() : other);
    }
    or_fail(error) {
        return PromiseResult.make(this.map(data => Result.ok(data)).or_else(Result.fail(error)));
    }
}
exports.PromiseOptional = PromiseOptional;
class PromiseResult {
    constructor(data) {
        this.data = data;
    }
    static make(data) {
        if (data instanceof Result) {
            return new PromiseResult(makePromise(data));
        }
        else {
            return new PromiseResult(data);
        }
    }
    map(f) {
        return new PromiseResult(this.data.then(d => d.map(f)));
    }
    chain(f) {
        function mapper(p) {
            let res = f(p);
            if (res instanceof PromiseResult) {
                return res.data;
            }
            else {
                return res;
            }
        }
        let res = this.data.then(d => d.map(mapper).either(err => makePromise(Result.fail(err)), data => data));
        return new PromiseResult(res);
    }
    either(f, g) {
        return this.data.then(r => r.either(f, g));
    }
}
exports.PromiseResult = PromiseResult;
function _arity(n, fn) {
    /* eslint-disable no-unused-vars */
    switch (n) {
        case 0: return function () { return fn.apply(this, arguments); };
        case 1: return function (a0) { return fn.apply(this, arguments); };
        case 2: return function (a0, a1) { return fn.apply(this, arguments); };
        case 3: return function (a0, a1, a2) { return fn.apply(this, arguments); };
        case 4: return function (a0, a1, a2, a3) { return fn.apply(this, arguments); };
        case 5: return function (a0, a1, a2, a3, a4) { return fn.apply(this, arguments); };
        case 6: return function (a0, a1, a2, a3, a4, a5) { return fn.apply(this, arguments); };
        case 7: return function (a0, a1, a2, a3, a4, a5, a6) { return fn.apply(this, arguments); };
        case 8: return function (a0, a1, a2, a3, a4, a5, a6, a7) { return fn.apply(this, arguments); };
        case 9: return function (a0, a1, a2, a3, a4, a5, a6, a7, a8) { return fn.apply(this, arguments); };
        case 10: return function (a0, a1, a2, a3, a4, a5, a6, a7, a8, a9) { return fn.apply(this, arguments); };
        default: throw new Error('First argument to _arity must be a non-negative integer no greater than ten');
    }
}
;
function curry(func) {
    return (...args) => {
        if (args.length >= func.length) {
            return func.apply(null, args);
        }
        else {
            let newf = (...arg2s) => func.apply(null, args.concat(arg2s));
            return curry(_arity(func.length - args.length, newf));
        }
    };
}
function liftA2(fun, a, b) {
    let f = curry(fun);
    return a.chain(a => b.map(f(a)));
}
exports.liftA2 = liftA2;
function liftA3(fun, a, b, c) {
    let f = curry(fun);
    return liftA2(f, a, b).chain(r => c.map(r));
}
exports.liftA3 = liftA3;
function liftA4(fun, a, b, c, d) {
    let f = curry(fun);
    return liftA3(f, a, b, c).chain(r => d.map(r));
}
exports.liftA4 = liftA4;
