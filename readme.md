<p align="center">
  <img src="Zoddi.png" width="200px" align="center" alt="Zoddi logo" />
  <h1 align="center">Zoddi</h1>
  <p align="center">
    Dependency injection using Zod
  </p>
</p>

## Introduction

Zoddi is a dependency injection container that uses Zod for typing. It allows you to define interfaces, implement them, and inject them.

Unlike other frameworks like inversify and autofac, Zoddi does not require additional mapping data -- just interfaces and implementations. You don't need decorators or pairs of interfaces and symbols. This is because Zod types, unlike TypeScript interfaces, survive to runtime.

## Basic Usage

```ts
const IAnimal = z.strictObject({
	legCount: z.number(),
	getNoise: z.function().args().returns(z.string())
});

const PetOwner = z.strictObject({
	pet: IAnimal
});

type IAnimal = z.infer<typeof IAnimal>;
type PetOwner = z.infer<typeof PetOwner>;

class Dog implements IAnimal {
	get legCount() { return 4; }
	getNoise() { return "woof"; }
};

const c = new Container();
c.bind(PetOwner).with(IAnimal).toFactory((a: IAnimal) => ({ pet: a }));
c.bind(IAnimal).toFactory(() => new Dog());

console.log(c.resolve(PetOwner).pet.getNoise()); // prints "woof"
```

## The Theory Behind Zoddi

DI frameworks in languages like Java and C# often use reflection to create a better Developer Experience. TypeScript frameworks can't do this, because reflection isn't available, because all the types are gone at runtime.

Zod types, however, live on at runtime. They can be reified into TypeScript types via `infer`. In effect, rather than start with types and use reflection to work with them at runtime, Zoddi starts with runtime data and uses Zod to reify them at development time, producing the same opportunities for smoother DX as in other languages.