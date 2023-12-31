import z from 'zod';
import { Container, DependencyResolutionError, dep } from '../';

const IAnimal = z.object({
	legCount: z.number(),
	getNoise: z.function().args().returns(z.string())
});

const PetOwner = z.strictObject({
	pet: IAnimal
});

const PetGroomer = z.strictObject({
	customer: PetOwner
});

const DomesticPair = z.strictObject({
	cat: IAnimal,
	dog: IAnimal
});

type IAnimal = z.infer<typeof IAnimal>;
type PetOwner = z.infer<typeof PetOwner>;
type PetGroomer = z.infer<typeof PetGroomer>;
type DomesticPair = z.infer<typeof DomesticPair>;

class Dog implements IAnimal {
	get legCount() { return 4; }
	getNoise() { return "woof"; }
};

class Human implements IAnimal {
	constructor(name: string) {this._name = name;}
	get legCount() { return 2; }
	getNoise() { return `My name is ${this._name}`; }
	private _name: string;
}

class LocalGroomer implements PetGroomer {
	constructor(public customer: PetOwner) {}
}

const sneakyCat: IAnimal = {
	legCount: 4,
	getNoise: () => "meow"
};

const sneakyCatKey = Symbol('sneaky-cat');

describe('zoddi', () => {
	test('Chained resolutions', () => {
		const c = new Container();
		c.bind(PetOwner).with(IAnimal).toFactory((a: IAnimal) => ({ pet: a }));
		c.bind(IAnimal).toFactory(() => new Dog());
		c.bind(PetGroomer).with(PetOwner).toType(LocalGroomer);

		expect(c.resolve(PetGroomer).customer.pet.getNoise()).toBe('woof');
	});
	test('Keyed resolutions and singletons', () => {
		const c = new Container();
		c.bind(IAnimal).toFactory(() => new Dog());
		c.bind(IAnimal, sneakyCatKey).toInstance(sneakyCat);
		expect(c.resolve(IAnimal, sneakyCatKey).getNoise()).toBe('meow');
	});
	test('Resolution failure', () => {
		const c = new Container();
		expect(() => c.resolve(IAnimal)).toThrowError(DependencyResolutionError);
	});
	test('No-param ctor binding', () => {
		const c = new Container();
		c.bind(IAnimal).toType(Dog);
		expect(c.resolve(IAnimal).getNoise()).toBe('woof');
	});
	test('Unknown key', () => {
		const c = new Container();
		c.bind(IAnimal).toFactory(() => sneakyCat);
		expect(() => c.resolve(IAnimal, sneakyCatKey)).toThrowError(DependencyResolutionError);
	});
	test('Object methods', () => {
		const c = new Container();
		const steve = new Human("steve");
		c.bind(IAnimal).toFactory(() => steve);
		expect(c.resolve(IAnimal).getNoise()).toBe('My name is steve');
	});
	test('Non-object deps', () => {
		// Note that we create a variable here. Two different calls to
		// z.string() return different objects and are thus not the same.
		// Functionally, this means zoddi uses identity equality for types,
		// not structural equality. A structural comparer is plausible,
		// but would be complex and potentially slow.
		const personName = z.string();
		const c = new Container();
		c.bind(personName).toFactory(() => "steve");
		c.bind(IAnimal).with(dep(personName)).toType(Human);
		expect(c.resolve(IAnimal).getNoise()).toBe('My name is steve');
	});
	test('Keyed deps', () => {
		const c = new Container();
		c.bind(PetOwner).with(dep(IAnimal, sneakyCatKey)).toFactory((a: IAnimal) => ({ pet: a }));
		c.bind(IAnimal).toFactory(() => new Dog());
		c.bind(IAnimal, sneakyCatKey).toInstance(sneakyCat);
		c.bind(PetGroomer).with(PetOwner).toType(LocalGroomer);
		expect(c.resolve(PetGroomer).customer.pet.getNoise()).toBe('meow');
	});
	test('Non-strict dep', () => {
		const c = new Container();
		c.bind(PetOwner).with(dep(IAnimal, sneakyCatKey, false)).toFactory((a: IAnimal) => ({ pet: a }));
		c.bind(IAnimal).toFactory(() => new Dog());
		c.bind(PetGroomer).with(PetOwner).toType(LocalGroomer);
		expect(c.resolve(PetGroomer).customer.pet.getNoise()).toBe('woof');
	});
	test('Failed strict dep', () => {
		const c = new Container();
		c.bind(PetOwner).with(dep(IAnimal, sneakyCatKey)).toFactory((a: IAnimal) => ({ pet: a }));
		c.bind(IAnimal).toFactory(() => new Dog());
		c.bind(PetGroomer).with(PetOwner).toType(LocalGroomer);
		expect(c.resolve(IAnimal).getNoise()).toBe('woof');
		expect(() => c.resolve(PetGroomer)).toThrowError(DependencyResolutionError);
	});
	test('Full dep before type', () => {
		const c = new Container();
		c.bind(IAnimal).toFactory(() => new Dog());
		c.bind(IAnimal, sneakyCatKey).toInstance(sneakyCat);
		c.bind(DomesticPair).with(dep(IAnimal, sneakyCatKey), IAnimal).toFactory((cat, dog) => ({cat, dog}));
	});
	test('Full dep after type', () => {
		const c = new Container();
		c.bind(IAnimal).toFactory(() => new Dog());
		c.bind(IAnimal, sneakyCatKey).toInstance(sneakyCat);
		c.bind(DomesticPair).with(IAnimal, dep(IAnimal, sneakyCatKey)).toFactory((dog, cat) => ({cat, dog}));
	});
	test('Split deps', () => {
		const c = new Container();
		c.bind(IAnimal).toFactory(() => new Dog());
		c.bind(IAnimal, sneakyCatKey).toInstance(sneakyCat);
		c.bind(DomesticPair).with(IAnimal).with(dep(IAnimal, sneakyCatKey)).toFactory((dog, cat) => ({cat, dog}));
	});
	test('Same instance', () => {
		const c = new Container();
		const steve = new Human("steve");
		c.bind(IAnimal).toFactory(() => steve);
		expect(c.resolve(IAnimal)).toBe(c.resolve(IAnimal));
	});
	test('Post-processing', () => {
		const c = new Container();
		const steve = new Human("steve");
		c.bind(IAnimal).postProcess((steve) => new Human("paul")).toInstance(steve);
		expect(c.resolve(IAnimal).getNoise()).toBe('My name is paul');
	});
});
