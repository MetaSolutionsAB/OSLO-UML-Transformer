import type { URL } from 'url';
import type { QuadStore } from '@oslo-flanders/core';
import { Logger, Scope, ns } from '@oslo-flanders/core';
import type {
  DataRegistry,
  EaObject,
  EaTag,
} from '@oslo-flanders/ea-uml-extractor';
import type * as RDF from '@rdfjs/types';
import { inject, injectable } from 'inversify';
import { DataFactory } from 'rdf-data-factory';
import { EaUmlConverterConfiguration } from '../config/EaUmlConverterConfiguration';
import { EaUmlConverterServiceIdentifier } from '../config/EaUmlConverterServiceIdentifier';
import { TagNames } from '../enums/TagNames';
import type { UriRegistry } from '../UriRegistry';
import { Status } from '../enums/Status';
import { Language } from '@oslo-flanders/core/lib/enums/Language';

@injectable()
export abstract class ConverterHandler<T extends EaObject> {
  @inject(EaUmlConverterServiceIdentifier.Configuration)
  public readonly config!: EaUmlConverterConfiguration;

  @inject(EaUmlConverterServiceIdentifier.Logger)
  public readonly logger!: Logger;

  public readonly df = new DataFactory();
  public readonly baseUrnScheme: string = 'urn:oslo-toolchain';

  /**
   * Creates RDF.Quads for objects with type T in the normalized model and adds them to an RDF.Store
   */
  public abstract convert(
    model: DataRegistry,
    uriRegistry: UriRegistry,
    store: QuadStore,
  ): Promise<QuadStore>;

  /**
   * Normalizes objects with type T in the data model
   */
  public abstract normalize(model: DataRegistry): Promise<DataRegistry>;

  /**
   * Assigns URIs to objects with type T in the data model and adds them to the URI registry
   */
  public abstract assignUris(
    normalizedModel: DataRegistry,
    uriRegistry: UriRegistry,
  ): Promise<UriRegistry>;

  /**
   * Creates and returns quads for an object with type T
   */
  public abstract createQuads(
    object: T,
    uriRegistry: UriRegistry,
    model?: DataRegistry,
  ): RDF.Quad[];

  /**
   * Removes objects that contain an ignore tag
   * @param model - The data registry containing the entities
   */
  public abstract filterIgnoredObjects(
    model: DataRegistry,
  ): Promise<DataRegistry>;

  /**
   * Removes objects that are set to hidden in the EA model
   * @param model - The data registry containing the entities
   */
  public abstract filterHiddenObjects(
    model: DataRegistry,
  ): Promise<DataRegistry>;

  /**
   * Adds information that was set via tags on an entity to the array of quads
   * @param object - The entity to extract the information from and add it to the array of quads
   * @param objectInternalId - An RDF.NamedNode representing the internal ID of the entity
   * @param quads - The array of quads
   * @param graph - The graph to add the quads to
   */
  public addEntityInformation(
    object: T,
    objectInternalId: RDF.NamedNode,
    quads: RDF.Quad[],
    graph: RDF.Quad_Graph = this.df.defaultGraph(),
  ): void {
    this.addDefinitions(object, objectInternalId, graph, quads);
    this.addLabels(object, objectInternalId, graph, quads);
    this.addUsageNotes(object, objectInternalId, graph, quads);
    this.addStatus(object, objectInternalId, graph, quads);
    if (this.config.allTags) {
      this.addOtherTags(object, objectInternalId, graph, quads);
    }
  }

  public addOtherTags(
    object: T,
    objectInternalId: RDF.NamedNode,
    graph: RDF.Quad_Graph,
    quads: RDF.Quad[],
  ) {
    const processedTagNames = new Set<string>(Object.values(TagNames));
    const allTags: EaTag[] = object.tags || [];

    const unknownTags = allTags.filter((tag) => {
      // Remove the language code suffix if it matches a known language code
      const tagNameBase = this.getBaseTagName(
        tag.tagName,
        Object.values(Language),
      );
      return !processedTagNames.has(tagNameBase);
    });

    if (unknownTags.length) {
      this.logger.info(
        `[ElementConverterHandler]: Unknown tags for element (${object.path}): ${unknownTags?.map((item) => item.tagName).join(', ')}. These tags will be added.`,
      );
      unknownTags.forEach((tag) => {
        const tagNameBase = this.getBaseTagName(
          tag.tagName,
          Object.values(Language),
        );
        // Cast this unknown tag to a TagNames
        const values: RDF.Literal[] = this.getTagValue(
          object,
          <TagNames>tagNameBase,
        );

        this.addValuesToQuads(
          values,
          objectInternalId,
          ns.oslo(`any:${tagNameBase}`),
          graph,
          quads,
        );
      });
    }
  }

  public addDefinitions(
    object: T,
    objectInternalId: RDF.NamedNode,
    graph: RDF.Quad_Graph,
    quads: RDF.Quad[],
  ): void {
    const apDefinitions: RDF.Literal[] = this.getTagValue(
      object,
      TagNames.ApDefinition,
    );
    this.addValuesToQuads(
      apDefinitions,
      objectInternalId,
      ns.oslo('apDefinition'),
      graph,
      quads,
    );

    const vocDefinitions: RDF.Literal[] = this.getTagValue(
      object,
      TagNames.Definition,
    );
    this.addValuesToQuads(
      vocDefinitions,
      objectInternalId,
      ns.oslo('vocDefinition'),
      graph,
      quads,
    );
  }

  public addLabels(
    object: T,
    objectInternalId: RDF.NamedNode,
    graph: RDF.Quad_Graph,
    quads: RDF.Quad[],
  ): void {
    const apLabels: RDF.Literal[] = this.getTagValue(object, TagNames.ApLabel);
    this.addValuesToQuads(
      apLabels,
      objectInternalId,
      ns.oslo('apLabel'),
      graph,
      quads,
    );

    const vocLabels: RDF.Literal[] = this.getTagValue(object, TagNames.Label);
    this.addValuesToQuads(
      vocLabels,
      objectInternalId,
      ns.oslo('vocLabel'),
      graph,
      quads,
    );

    // The name of the object as it appears on the diagram is also provided
    this.addValuesToQuads(
      [this.df.literal(object.name, this.config.language)],
      objectInternalId,
      ns.oslo('diagramLabel'),
      graph,
      quads,
    );
  }

  public addUsageNotes(
    object: T,
    objectInternalId: RDF.NamedNode,
    graph: RDF.Quad_Graph,
    quads: RDF.Quad[],
  ): void {
    const apUsageNotes: RDF.Literal[] = this.getTagValue(
      object,
      TagNames.ApUsageNote,
    );
    this.addValuesToQuads(
      apUsageNotes,
      objectInternalId,
      ns.oslo('apUsageNote'),
      graph,
      quads,
    );

    const vocUsageNotes: RDF.Literal[] = this.getTagValue(
      object,
      TagNames.UsageNote,
    );
    this.addValuesToQuads(
      vocUsageNotes,
      objectInternalId,
      ns.oslo('vocUsageNote'),
      graph,
      quads,
    );

    if (object.notes) {
      // The name of the object as it appears on the diagram is also provided
      this.addValuesToQuads(
        [this.df.literal(object.notes, this.config.language)],
        objectInternalId,
        ns.oslo('diagramNotes'),
        graph,
        quads,
      );
    }
  }

  public addStatus(
    object: T,
    objectInternalId: RDF.NamedNode,
    graph: RDF.Quad_Graph,
    quads: RDF.Quad[],
  ): void {
    const status: RDF.Literal[] = this.getTagValue(object, TagNames.Status);

    // don't process if there is no status defined
    if (!status.length) return;

    // only add the status if it is a valid status and not empty
    if (
      status.length &&
      Object.values(Status).includes(<Status>status[0]?.value)
    ) {
      quads.push(
        this.df.quad(
          objectInternalId,
          ns.oslo('status'),
          this.df.namedNode(status[0].value),
          graph,
        ),
      );
    } else {
      this.logger.warn(
        `[ConverterHandler]: Incorrect status found for ${object.path}. The status will be ignored.`,
      );
    }
  }

  /**
   * Determines the scope of the assigned URI of an entity
   * @param object - The entity to determine the scope for
   * @param objectInternalId - An RDF.NamedNode representing the internal ID of the entity
   * @param packageBaseUri - The base URI that has been set on the EA package
   * @param idUriMap - A map containing the entity id and assigned URI
   * @param quads - An array of RDF.Quads to add the quad to
   */
  public addScope(
    object: T,
    objectInternalId: RDF.NamedNode,
    packageBaseUri: string,
    idUriMap: Map<number, URL>,
    graph: RDF.Quad_Graph,
    quads: RDF.Quad[],
  ): void {
    const uri: URL | undefined = idUriMap.get(object.id);

    let scope: Scope = Scope.External;

    if (!uri) {
      this.logger.warn(
        `[ConverterHandler]: Unable to find the URI for object with path ${object.path}. Setting scope to "Undefined".`,
      );
      scope = Scope.Undefined;
      return;
    }

    if (uri.toString().startsWith(this.config.publicationEnvironment)) {
      scope = Scope.InPublicationEnvironment;
    }

    if (uri.toString().startsWith(packageBaseUri)) {
      scope = Scope.InPackage;
    }

    quads.push(
      this.df.quad(
        objectInternalId,
        ns.oslo('scope'),
        this.df.namedNode(scope),
        graph,
      ),
    );
  }

  // https://vlaamseoverheid.atlassian.net/browse/SDTT-344
  // Needed a way to log errors without throwing them so that the conversion process can continue
  public handleError(
    value: string | any[] | undefined | null,
    error: string,
  ): boolean {
    if (!value || (Array.isArray(value) && !value.length)) {
      if (this.config.debug) {
        this.logger.error(error);
        return true;
      }
      throw new Error(error);
    }
    return false;
  }

  /**
   * Extract the value for a tag
   * @param tagName - The name of the tag to extract the value for
   * @param languages - An array of the possible LanguageCodes
   * @returns - A string with the value of the tag without any language code suffix
   */
  private getBaseTagName(tagName: string, languages: string[]): string {
    const parts: string[] = tagName.split('-');
    const languageCode: string = parts[parts.length - 1];
    return languages.includes(languageCode)
      ? parts.slice(0, -1).join('-')
      : tagName;
  }

  /**
   * Extract the value for a tag
   * @param object - The entity to extract the tag values from
   * @param tag - The name of the tag to extract the value for
   * @returns - An array of RDF.Literals
   */
  private getTagValue(object: T, tag: TagNames): RDF.Literal[] {
    return this.getLanguageDependentTag(object, tag);
  }

  /**
   * Adds RDF.Literals to an array of quads for a configurable subject and predicate
   * @param values - An array of RDF.Literals
   * @param objectInternalId  - An RDF.NamedNode representing the URI of the subject
   * @param predicate - An RDF.NamedNode representing the predicate
   * @param graph - To graph to add to quads to
   * @param quads - The array of quads
   */
  private addValuesToQuads(
    values: RDF.Literal[],
    objectInternalId: RDF.NamedNode,
    predicate: RDF.NamedNode,
    graph: RDF.Quad_Graph,
    quads: RDF.Quad[],
  ): void {
    values.forEach((value) => {
      quads.push(this.df.quad(objectInternalId, predicate, value, graph));
    });
  }

  /**
   * Returns all parametrized values of tags that contain the tag name
   * @param object — The object to extract the tag values from
   * @param name  — The name of the tag
   */
  public getParameterizedValues(object: T, name: TagNames): { key:string, value:string }[] {
    const tags: EaTag[] = object.tags.filter((x: EaTag) =>
      x.tagName.startsWith(name),
    );
    const pairs: { key:string, value:string }[] = [];

    const keyToValueMap = new Map<string, string>();

    tags.forEach((tag: EaTag) => {
      const parts: string[] = tag.tagName.split('-');
      let key: string = parts[parts.length - 1];

      const tagValue: string = tag.tagValue;
      if (!tagValue) {
        this.logger.warn(
          `[ConverterHandler]: Entity with path ${object.path} has an empty value for tag ${tag.tagName}.`,
        );
        return;
      }

      if (keyToValueMap.has(key)) {
        this.logger.warn(
          `[ConverterHandler]: Entity with path ${object.path} has already a value for ${tag.tagName} for ${key}, but will be overwritten.`,
        );
      }

      keyToValueMap.set(key, tag.tagValue);
    });

    keyToValueMap.forEach((value: string, key: string) => {
      pairs.push({key, value: value.trim()});
    });

    return pairs;
  }

  /**
   * Returns all values of tags that contain the tag name
   * @param object — The object to extract the tag values from
   * @param name  — The name of the tag
   */
  private getLanguageDependentTag(object: T, name: TagNames): RDF.Literal[] {
    const tags: EaTag[] = object.tags.filter((x: EaTag) =>
      x.tagName.startsWith(name),
    );
    const literals: RDF.Literal[] = [];

    const languageToTagValueMap = new Map<string, string>();

    tags.forEach((tag: EaTag) => {
      const parts: string[] = tag.tagName.split('-');
      let languageCode: string = parts[parts.length - 1];

      // Add fallback for when the language is not defined to always pick the dutch language as default. Implemented as part of the
      // https://vlaamseoverheid.atlassian.net/jira/software/projects/SDTT/issues/SDTT-343 solution
      const knownLanguageCodes = <string[]>Object.values(Language);
      languageCode = knownLanguageCodes.includes(languageCode)
        ? languageCode
        : this.config.language;

      const tagValue: string = tag.tagValue;
      if (!tagValue) {
        this.logger.warn(
          `[ConverterHandler]: Entity with path ${object.path} has an empty value for tag ${tag.tagName}.`,
        );
        return;
      }

      if (languageToTagValueMap.has(languageCode)) {
        this.logger.warn(
          `[ConverterHandler]: Entity with path ${object.path} has already a value for ${tag.tagName} in language ${languageCode}, but will be overwritten.`,
        );
      }

      languageToTagValueMap.set(languageCode, tag.tagValue);
    });

    languageToTagValueMap.forEach((value: string, languageCode: string) => {
      literals.push(this.df.literal(value.trim(), languageCode));
    });

    return literals;
  }
}
