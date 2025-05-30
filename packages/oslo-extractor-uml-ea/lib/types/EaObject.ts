import type { EaTag } from './EaTag';
import { decodeXML } from 'entities';

export abstract class EaObject {
  public readonly id: number;
  public readonly name: string;
  public readonly eaGuid: string;
  public readonly notes: string | undefined;
  private _osloGuid: string | undefined;
  private _path: string | undefined;
  public tags: EaTag[];

  public constructor(id: number, name: string, guid: string, notes?: string) {
    this.id = id;
    this.name = name;
    this.eaGuid = guid;
    this.tags = [];
    this.notes = notes ? decodeXML(notes) : undefined;
  }

  public get osloGuid(): string {
    if (!this._osloGuid) {
      throw new Error(`OSLO guid has not been set yet for ${this.constructor.name} with EA guid ${this.eaGuid}.`);
    }
    return this._osloGuid;
  }

  public set osloGuid(value: string) {
    this._osloGuid = value;
  }

  public get path(): string {
    if (!this._path) {
      return this.name;
    }

    return this._path;
  }

  public set path(value: string) {
    this._path = value;
  }
}
