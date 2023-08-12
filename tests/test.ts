import z from 'zod';
import { Container, DependencyResolutionError } from '../';

const IAnimal = z.strictObject({
	legCount: z.number(),
	getNoise: z.function().args().returns(z.string())
});

const PetOwner = z.strictObject({
	pet: IAnimal
});

const PetGroomer = z.strictObject({
	customer: PetOwner
});

type IAnimal = z.infer<typeof IAnimal>;
type PetOwner = z.infer<typeof PetOwner>;
type PetGroomer = z.infer<typeof PetGroomer>;

class Dog implements IAnimal {
	get legCount() { return 4; }
	getNoise() { return "woof"; }
};

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
		c.bind(IAnimal, sneakyCatKey).toFactory(() => sneakyCat);
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
});
