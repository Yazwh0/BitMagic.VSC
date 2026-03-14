
export enum LineType {
    BuiltIn,
    Colour,
    Rgb
}

export class LineItem {
    predicate: string;
    lineType: LineType;
    definition: string;
    R: string;
    G: string
    B: string

    constructor(predicate: string, lineType: LineType, definition: string, R: string, G: string, B: string) {
        this.predicate = predicate;
        this.lineType = lineType;
        this.definition = definition;
        this.R = R;
        this.G = G;
        this.B = B;
    }
}
