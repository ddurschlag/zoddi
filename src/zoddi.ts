import z from 'zod';

// What can be injected/resoslved
type Injectable = z.ZodTypeAny;

// Variations on multiplicity for dependency types
// These include only the types, not key/strictness
type EmptyZodDependencies = [];
type AnyZodDependencies = Injectable[];
type PresentZodDependencies = [Injectable, ...AnyZodDependencies];
type ZodDependencies = EmptyZodDependencies | PresentZodDependencies;

// Functions for concetenating dependency tuples
type AssertZodDependencies<T extends ZodDependencies> = T extends EmptyZodDependencies ? EmptyZodDependencies : T extends [infer H, ...infer R] ? [H, ...AssertAnyZodDependencies<R>] : never;
type AssertAnyZodDependencies<T extends unknown[]> = T extends EmptyZodDependencies ? AssertZodDependencies<EmptyZodDependencies> : T extends PresentZodDependencies ? AssertZodDependencies<T> : never;
type ConcatZodDependencies<T extends ZodDependencies, U extends ZodDependencies> =
	T extends EmptyZodDependencies
		? (U extends EmptyZodDependencies
			? EmptyZodDependencies
			: (U extends [infer H, ...infer R]
				? [H, ...AssertAnyZodDependencies<R>]
				: never))
		: (T extends [infer H, ...infer R]
			? (U extends EmptyZodDependencies
				? [H, ...AssertAnyZodDependencies<R>]
				: (U extends [infer UH, ...infer UR]
					? [H, ...AssertAnyZodDependencies<R>, UH, ...AssertAnyZodDependencies<UR>]
					: never))
			: never);

// Possible keys for differentiating between multiple implementations
// Default is null
type KeyType = symbol | null;

// Function to post-process an instance after zod checking
type PostProcessor<T extends Injectable> = ((checked: T["_input"]) => T["_input"]);

// Full dependencies, including keys and strictness
type Dependency<T extends Injectable> = { type: T, strict: boolean, key: KeyType }
type RawDependency<T extends Injectable> = Dependency<T>|T;
type RawDependencies<T extends ZodDependencies> = {[K in keyof T]: RawDependency<T[K]>}
type Dependencies<T extends ZodDependencies> = {[K in keyof T]: Dependency<T[K]>}

// Build up a list of dependencies (allows repeated with() calls)
function concatDependencies<T extends ZodDependencies, U extends ZodDependencies>(t: Dependencies<T>, u: Dependencies<U>): Dependencies<ConcatZodDependencies<T, U>> {
	return [...t, ...u] as any;
}

// Functions for ensuring raw dependencies become full dependencies
function buildDependency<T extends Injectable>(dep: Dependency<T>): Dependency<T>;
function buildDependency<T extends Injectable>(dep: T): Dependency<T>;
function buildDependency<T extends Injectable>(dep: Dependency<T>|T): Dependency<T> {
	if (dep instanceof z.ZodType) {
		const type = dep;
		const strict = false;
		const key = null;
		return { type, strict, key };
	}
	return dep;
}
function buildDependencies<T extends ZodDependencies>(deps: RawDependencies<T>): Dependencies<T> {
	return deps.map(buildDependency) as any; // todo: wish this could be a less aggresssive cast, or none at all somehow
}

// The type of the factory function needed to register a provider
type Factory<TDeps extends ZodDependencies, TInterface extends Injectable> = z.InnerTypeOfFunction<z.ZodTuple<[...TDeps], z.ZodUnknown>, TInterface>;

// How an injectable is resolved
type Provider = {
	// Dependencies needed to resolve this injectable
	dependencies: Dependencies<ZodDependencies>,
	// Implementation to call to get injectable.
	// Dependencies are provided as parameters
	// Note that types are wrapped in a function which calls their constructor
	// It would be very nice if this could be Factory<Dependencies, Injectable> instead of z.InnerTypeOfFunction<any, any>
	impl: z.InnerTypeOfFunction<any, any>,
	// Optional key if multiple implementations are desired
	key: symbol | null;
	// Optional post-processing function after zod validation
	postProcessor: null | PostProcessor<Injectable>;
};

// A type that implements an interface. Once bound will be wrapped in an appropriate factory
type Implementor<TInterface extends Injectable, TDeps extends ZodDependencies> = { new(...args: z.ZodTuple<[...TDeps], z.ZodUnknown>["_output"]): TInterface["_input"] };

export class DependencyResolutionError extends Error {
	constructor(public bound: Injectable, public key: KeyType) {
		super(`Could not resolve dependency: ${JSON.stringify({ bound, key })}`);
		Object.setPrototypeOf(this, DependencyResolutionError.prototype);
	}
}

// Get a passthrough version of a type, but have it masquerade
// as its inner type. Useful for type-checking arguments
function passthrough<T extends Injectable>(input: T) {
	if (input instanceof z.ZodObject) {
		return input.passthrough() as unknown as T;
	}
	return input;
}
// Passthrough types for a set of full dependencies
function passthroughDependencyTypes<T extends ZodDependencies>(t: Dependencies<T>): T {
	return t.map(({type}) => passthrough(type)) as any;
}

// Storage for providers
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

class InstanceStorage {
	constructor() {
		this._map = new Map();
	}

	public store(bound: Injectable, key: KeyType, instance: unknown) {
		let keyMap = this._map.get(bound);
		if (keyMap === undefined) {
			keyMap = new Map();
			this._map.set(bound, keyMap);
		}
		keyMap.set(key, instance);
	}
	public retrieve<T>(bound: Injectable, key: KeyType) {
		const keyMap = this._map.get(bound);
		if (keyMap === undefined) {
			return null;
		}
		const result = keyMap.get(key);
		console.log({bound, key, result});
		if (result === undefined) {
			return null;
		}
		return result as T;
	}
	private _map: Map<
		Injectable, // What we're going to get
		Map<KeyType, unknown>
	>;
}

// Fluent builder for implementation provision
class Binder<TInterface extends Injectable, TDepTypes extends ZodDependencies> {
	constructor(
		storage: ProviderStorage,
		bound: TInterface,
		dependencies: Dependencies<TDepTypes>,
		key: KeyType,
		postProcessor: null | PostProcessor<TInterface> = null
	) {
		this._storage = storage;
		this._bound = bound;
		this._dependencies = dependencies;
		this._key = key;
		this._retCheckType = passthrough(bound);
		this._depCheckType = passthroughDependencyTypes(dependencies);
		this._postProcessor = postProcessor;
	}

	public postProcess(processor: PostProcessor<TInterface>) {
		return new Binder(
			this._storage,
			this._bound,
			this._dependencies,
			this._key,
			processor
		);
	}

	public with<TMoreDeps extends ZodDependencies>(...moreDeps: RawDependencies<TMoreDeps>) {
		return new Binder(
			this._storage,
			this._bound,
			concatDependencies(this._dependencies, buildDependencies(moreDeps)),
			this._key
		); 
	}

	public toFactory(factory: Factory<TDepTypes, TInterface>) {
		const impl = z.function().args(...this._depCheckType).returns(this._retCheckType).strictImplement(factory);
		this._storage.store(this._bound, { dependencies: this._dependencies, impl, key: this._key, postProcessor: this._postProcessor as any });
	}

	public toType(implementor: Implementor<TInterface, TDepTypes>) {
		const impl = z.function().args(...this._depCheckType).returns(this._retCheckType).strictImplement((...args) => new implementor(...args));
		this._storage.store(this._bound, { dependencies: this._dependencies, impl, key: this._key, postProcessor: this._postProcessor as any });
	}

	public toInstance(instance: TInterface["_input"]) {
		return this.toFactory(() => instance);
	}

	private _storage: ProviderStorage;
	private _bound: TInterface;
	private _dependencies: Dependencies<TDepTypes>;
	private _key: KeyType;
	private _retCheckType: TInterface;
	private _depCheckType: TDepTypes;
	private _postProcessor: null | PostProcessor<TInterface>;
};

// IoC container. Bind stuff in, resolve stuff out.
export class Container {
	constructor() {
		this._storage = new ProviderStorage();
		this._instanceStorage = new InstanceStorage();
	}

	// Bind to a type, with optional key. Use keys
	// if you have multiple implementations of a type
	public bind<TInterface extends Injectable>(bound: TInterface, key: KeyType = null) {
		return new Binder(this._storage, bound, [], key);
	}

	// Resolve a type with optional key. Will resolve
	// any dependencies of the implementation as well.
	// Use keys if you have multiple implementatiosn of a type
	public resolve<TInterface extends Injectable>(boundInterface: TInterface, key: KeyType = null): z.infer<TInterface> {
		let result = this._instanceStorage.retrieve<z.infer<TInterface>>(boundInterface, key);
		if (result === null) {
			const { dependencies, impl, postProcessor } = this._storage.retrieve(boundInterface, key);
			let newResult = Reflect.apply<null, Injectable[], z.infer<TInterface>>(impl, null, dependencies.map((d) => this.resolveDependency(d)));
			if (postProcessor !== null) {
				newResult = postProcessor(newResult);
			}
			this._instanceStorage.store(boundInterface, key, newResult);
			return newResult;
		}
		return result;
	}

	private resolveDependency<TInterface extends Injectable>(dep: Dependency<TInterface>) {
		if (dep.key !== null) {
			try {
				return this.resolve(dep.type, dep.key);
			} catch (ex) {
				if (!dep.strict) {
					return this.resolve(dep.type);
				} else {
					throw ex;
				}
			}
		}
		return this.resolve(dep.type);
	}

	private _storage: ProviderStorage;
	private _instanceStorage: InstanceStorage;
}

// Function to get a full dependency instead
// of just a type.
export function dep<T extends Injectable>(
	type: T,
	key: KeyType = null,
	strict: boolean = true
): Dependency<T> {
	return {type, key, strict};
}
