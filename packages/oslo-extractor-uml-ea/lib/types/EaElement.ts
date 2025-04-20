import { uniqueId } from '@oslo-flanders/core';
import type { ElementType } from '../enums/ElementType';
import { EaObject } from '../types/EaObject';

/**
 * Represents an element in Enterprise Architect
 * @see ElementType for possible types of an EaElement
 */
export class EaElement extends EaObject {
  public readonly type: ElementType;
  public readonly packageId: number;
  public readonly notes: string | undefined;

  public constructor(
    id: number,
    name: string,
    guid: string,
    type: ElementType,
    packageId: number,
    notes: string,
  ) {
    super(id, name, guid, notes);

    this.type = type;
    this.packageId = packageId;
    this.notes = notes;

    this.osloGuid = uniqueId(guid, name, id);
  }
}
