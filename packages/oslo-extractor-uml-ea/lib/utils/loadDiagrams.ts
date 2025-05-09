import alasql from 'alasql';
import type MDBReader from 'mdb-reader';
import type { DataRegistry } from '../DataRegistry';
import { ConnectorDirection } from '../enums/ConnectorDirection';
import { EaTable } from '../enums/EaTable';
import type { EaConnector } from '../types/EaConnector';
import { EaDiagram } from '../types/EaDiagram';
import type { EaPackage } from '../types/EaPackage';
import { resolveConnectorDirection } from '../utils/resolveConnectorDirection';

export function loadDiagrams(
  mdb: MDBReader,
  model: DataRegistry,
): DataRegistry {
  const diagrams = mdb.getTable(EaTable.Diagram).getData();

  model.diagrams = diagrams.map(
    (item) =>
      new EaDiagram(
        <number>item.Diagram_ID,
        <string>item.Name,
        <string>item.ea_guid,
        <number>item.Package_ID,
        <string>item.Notes
      ),
  );

  model.diagrams.forEach((diagram) => setDiagramPath(diagram, model.packages));

  loadDiagramObjects(mdb, model.diagrams);
  loadDiagramConnectors(mdb, model.diagrams, model.connectors);

  return model;
}

function loadDiagramObjects(mdb: MDBReader, diagrams: EaDiagram[]): void {
  // Const logger = getLoggerFor('DiagramObjectLoader');
  const diagramObjects = mdb.getTable(EaTable.DiagramObject).getData();
  const objects = mdb.getTable(EaTable.Object).getData();

  const query = `
    SELECT Diagram_ID, Object_ID
    FROM ? diagramObject
    INNER JOIN ? object ON diagramObject.Object_ID = object.Object_ID
    WHERE object.Object_Type IN ('Class', 'DataType', 'Enumeration')`;

  const filteredDiagramObjects = <any[]>(
    alasql(query, [diagramObjects, objects])
  );
  filteredDiagramObjects.forEach((diagramObject) => {
    const diagram = diagrams.find((x) => x.id === diagramObject.Diagram_ID);

    if (!diagram) {
      // TODO: log message
      return;
    }

    diagram.elementIds = diagram.elementIds
      ? [...diagram.elementIds, diagramObject.Object_ID]
      : [diagramObject.Object_ID];
  });
}

function loadDiagramConnectors(
  reader: MDBReader,
  diagrams: EaDiagram[],
  elementConnectors: EaConnector[],
): void {
  const diagramConnectors = reader.getTable(EaTable.DiagramLink).getData();

  diagramConnectors.forEach((diagramConnector) => {
    const diagram = diagrams.find((x) => x.id === diagramConnector.DiagramID);

    if (!diagram) {
      // TODO: log message
      return;
    }

    let direction = ConnectorDirection.Unspecified;

    if (diagramConnector.Geometry === null) {
      // TODO: log message
      return;
    }
    direction = resolveConnectorDirection(<string>diagramConnector.Geometry);

    // https://vlaamseoverheid.atlassian.net/jira/software/projects/SDTT/issues/SDTT-347
    // Added a second check to only allow connectors from the active diagram

    // https://vlaamseoverheid.atlassian.net/jira/software/projects/SDTT/issues/SDTT-352
    // The second check is not necessary anymore, as the diagram link table only contains links to the active diagram
    // classes that are being imported from other packages are not shown in the diagram which means that we lose
    // information about the connectors of the other diagram
    const connector = elementConnectors.find(
      (x) => x.id === diagramConnector.ConnectorID,
    );
    if (!connector) {
      // TODO: log message
      return;
    }

    connector.diagramGeometryDirection = direction;
    connector.hidden = <boolean>diagramConnector.Hidden;

    diagram.connectorsIds = diagram.connectorsIds
      ? [...diagram.connectorsIds, <number>diagramConnector.ConnectorID]
      : [<number>diagramConnector.ConnectorID];
  });
}

function setDiagramPath(diagram: EaDiagram, packages: EaPackage[]): void {
  const diagramPackage = packages.find(
    (x) => x.packageId === diagram.packageId,
  );
  let path: string;

  if (!diagramPackage) {
    // TODO: log message
    path = diagram.name;
  } else {
    path = `${diagramPackage.path}:${diagram.name}`;
  }

  diagram.path = path;
}
