export class Dictionary<T> {
    private items: { [key: string]: T };

    constructor() {
        this.items = {};
    }

    public add(key: string, value: T) {
        this.items[key] = value;
    }

    public has(key: string): boolean {
        return key in this.items;
    }

    public get(key: string): T {
        return this.items[key];
    }

    public tryGet(key: string): T | undefined {
        if (this.items[key])
            return this.items[key];

        return undefined;
    }

    public getItems() : any
    {
        return this.items;
    }
}
