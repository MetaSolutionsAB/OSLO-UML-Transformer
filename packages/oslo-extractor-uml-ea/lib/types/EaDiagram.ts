import { uniqueId } from '@oslo-flanders/core';
import { EaObject } from './EaObject';

/**
 * Represents a diagram in Enterprise Architect
 */
export class EaDiagram extends EaObject {
  public readonly packageId: number;
  public connectorsIds: number[];
  public elementIds: number[];

  public constructor(
    id: number,
    name: string,
    guid: string,
    packageId: number,
    notes: string,
  ) {
    super(id, name, guid, notes);

    this.packageId = packageId;
    this.connectorsIds = [];
    this.elementIds = [];

    this.osloGuid = uniqueId(guid, name, id);
  }
}
