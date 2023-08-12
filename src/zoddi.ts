import z from 'zod';

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

// An object which can can bind things -- used in fluent API
type Binder<TInterface extends Injectable, TDeps extends Dependencies> = {
	toFactory: ((factory: Factory<TDeps, TInterface>) => void),
	toType: ((implementor: Implementor<TInterface, TDeps>) => void)
};

// Possible keys for differentiating between multiple implementations
// Default is null
type KeyType = symbol | null;

export class DependencyResolutionError extends Error {
	constructor(public bound: Injectable, public key: KeyType) {
		super(`Could not resolve dependency: ${JSON.stringify({ bound, key })}`);
		Object.setPrototypeOf(this, DependencyResolutionError.prototype);
	}
}

export class Container {
	constructor() {
		this._map = new Map();
	}

	public bind<TInterface extends Injectable>(bound: TInterface, key: KeyType = null): Binder<TInterface, []> & { with: <TDeps extends Dependencies>(...deps: TDeps) => Binder<TInterface, TDeps> } {
		return {
			with:
				<TDeps extends Dependencies>(...dependencies: TDeps): Binder<TInterface, TDeps> => ({
					toFactory:
						(factory: Factory<TDeps, TInterface>) => {
							const impl = z.function().args(...dependencies).returns(bound).strictImplement(factory);
							this.store(bound, { dependencies, impl, key });
						},
					toType:
						(implementor: Implementor<TInterface, TDeps>) => {
							const impl = z.function().args(...dependencies).returns(bound).strictImplement((...args) => new implementor(...args));
							this.store(bound, { dependencies, impl, key });
						}
				}),
			toFactory:
				(factory: Factory<[], TInterface>) => {
					const impl = z.function().returns(bound).strictImplement(factory);
					this.store(bound, { dependencies: [], impl, key });
				},
			toType:
				(implementor: Implementor<TInterface, []>) => {
					const impl = z.function().returns(bound).strictImplement((...args) => new implementor(...args));
					this.store(bound, { dependencies: [], impl, key });
				}
		};
	};

	public resolve<TInterface extends z.ZodTypeAny>(boundInterface: TInterface, key: KeyType = null) {
		const { dependencies, impl } = this.retrieve(boundInterface, key);
		const result: z.infer<TInterface> = Reflect.apply<null, Injectable[], z.infer<TInterface>>(impl, null, dependencies.map((d) => this.resolve(d)));
		return result;
	}

	private store(bound: Injectable, provider: Provider) {
		let keyMap = this._map.get(bound);
		if (keyMap === undefined) {
			keyMap = new Map();
			this._map.set(bound, keyMap);
		}
		keyMap.set(provider.key, provider);
	}
	private retrieve(bound: Injectable, key: KeyType) {
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