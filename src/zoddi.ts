import z from 'zod';
import { zodFunctionParseWithThisSupport } from './zodFunctionParseWithThisSupport.js';

// What can be injected/resoslved
type Injectable = z.ZodTypeAny;

// Tuple of the dependencies needed to resolve something
type Dependencies = [] | [Injectable, ...Injectable[]];

// The type of the factory function needed to register a provider
type Factory<TDeps extends Dependencies, TInterface extends Injectable> = z.InnerTypeOfFunction<z.ZodTuple<[...TDeps], z.ZodUnknown>, TInterface>;

// How an injectable is resolved
type Provider = {
	// Dependencies needed to resolve this injectable
	dependencies: Dependencies,
	// Implementation to call to get injectable.
	// Dependencies are provided as parameters
	// Note that types are wrapped in a function which calls their constructor
	// It would be very nice if this could be Factory<Dependencies, Injectable> instead of z.InnerTypeOfFunction<any, any>
	impl: z.InnerTypeOfFunction<any, any>,
	// Optional key if multiple implementations are desired
	key: symbol | null;
};

// A type that implements an interface. Once bound will be wrapped in an appropriate factory
type Implementor<TInterface extends Injectable, TDeps extends Dependencies> = { new(...args: z.ZodTuple<[...TDeps], z.ZodUnknown>["_output"]): TInterface["_input"] };

// Possible keys for differentiating between multiple implementations
// Default is null
type KeyType = symbol | null;

export class DependencyResolutionError extends Error {
	constructor(public bound: Injectable, public key: KeyType) {
		super(`Could not resolve dependency: ${JSON.stringify({ bound, key })}`);
		Object.setPrototypeOf(this, DependencyResolutionError.prototype);
	}
}

function passthrough<T extends Injectable>(input: T) {
	if (input instanceof z.ZodObject) {
		return input.passthrough() as unknown as T;
	}
	return input;
}

class ProviderStorage {
	constructor() {
		this._map = new Map();
	}

	public store(bound: Injectable, provider: Provider) {
		let keyMap = this._map.get(bound);
		if (keyMap === undefined) {
			keyMap = new Map();
			this._map.set(bound, keyMap);
		}
		keyMap.set(provider.key, provider);
	}
	public retrieve(bound: Injectable, key: KeyType) {
		const keyMap = this._map.get(bound);
		if (keyMap === undefined) {
			throw new DependencyResolutionError(bound, key);
		}
		const result = keyMap.get(key);
		if (result === undefined) {
			throw new DependencyResolutionError(bound, key);
		}
		return result;
	}
	private _map: Map<
		Injectable, // What we're going to get
		Map<KeyType, Provider>
	>;	
}

class Binder<TInterface extends Injectable, TDeps extends Dependencies> {
	constructor(
		storage: ProviderStorage,
		bound: TInterface,
		dependencies: TDeps,
		key: KeyType
	) {
		this._storage = storage;
		this._bound = bound;
		this._dependencies = dependencies;
		this._key = key;
		this._retCheckType = passthrough(bound);
		this._depCheckType = dependencies.map(passthrough) as TDeps;
	}

	public with<TMoreDeps extends [Injectable, ...Injectable[]]>(...moreDeps: TMoreDeps) {
		const x: [...(typeof this._dependencies), ...(typeof moreDeps)] = [...this._dependencies, ...moreDeps];
		return new Binder(this._storage, this._bound, x, this._key);
	}

	public toFactory(factory: Factory<TDeps, TInterface>) {
		const impl = z.function().args(...this._depCheckType).returns(this._retCheckType).strictImplement(factory);
		this._storage.store(this._bound, { dependencies: this._dependencies, impl, key: this._key });
	}

	public toType(implementor: Implementor<TInterface, TDeps>) {
		const impl = z.function().args(...this._depCheckType).returns(this._retCheckType).strictImplement((...args) => new implementor(...args));
		this._storage.store(this._bound, { dependencies: this._dependencies, impl, key: this._key });
	}

	public toInstance(instance: TInterface["_input"]) {
		return this.toFactory(() => instance);
	}

	private _storage: ProviderStorage;
	private _bound: TInterface;
	private _dependencies: TDeps;
	private _key: KeyType;
	private _retCheckType: TInterface;
	private _depCheckType: TDeps;
};

export class Container {
	constructor() {
		monkeyPatchZodForObjectMethodThis();
		this._storage = new ProviderStorage();
	}

	public bind<TInterface extends Injectable>(bound: TInterface, key: KeyType = null) {
		return new Binder(this._storage, bound, [], key);
	}

	public resolve<TInterface extends z.ZodTypeAny>(boundInterface: TInterface, key: KeyType = null) {
		const { dependencies, impl } = this._storage.retrieve(boundInterface, key);
		const result: z.infer<TInterface> = Reflect.apply<null, Injectable[], z.infer<TInterface>>(impl, null, dependencies.map((d) => this.resolve(d)));
		return result;
	}

	private _storage: ProviderStorage;
}

let monkeyPatchZodForObjectMethodThisApplied = false;

function monkeyPatchZodForObjectMethodThis() {
	if (monkeyPatchZodForObjectMethodThisApplied === false) {
		monkeyPatchZodForObjectMethodThisApplied = true;
		z.ZodFunction.prototype._parse = zodFunctionParseWithThisSupport;
	}
}