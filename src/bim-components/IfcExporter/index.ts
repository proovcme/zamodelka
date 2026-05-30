export class IfcExporter {
  static exportToIfc(elements: any[], projectName = "Ventilation Project"): string {
    let nextId = 1;
    const getNextId = () => nextId++;

    const pPerson = getNextId(); // #1
    const pOrg = getNextId();    // #2
    const pPersonAndOrg = getNextId(); // #3
    const pApp = getNextId();    // #4
    const pOwnerHist = getNextId(); // #5
    const uLength = getNextId(); // #6
    const uArea = getNextId();   // #7
    const uVolume = getNextId(); // #8
    const uAssign = getNextId(); // #9
    const pProj = getNextId();   // #10
    const geomContext = getNextId(); // #11
    const wAxis = getNextId();   // #12
    const wPoint = getNextId();  // #13
    const pSite = getNextId();   // #14
    const pBuilding = getNextId(); // #15
    const pStorey = getNextId(); // #16

    let stepLines: string[] = [
      `ISO-10303-21;`,
      `HEADER;`,
      `FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');`,
      `FILE_NAME('${projectName}.ifc','2026-05-29T11:18:00',('Engineer'),('SPbGASU'),'VentModeller','VentModeller','');`,
      `FILE_SCHEMA(('IFC2X3'));`,
      `ENDSEC;`,
      `DATA;`,
      `#${pPerson}=IFCPERSON($,$,'Engineer',$,$,$,$,$);`,
      `#${pOrg}=IFCORGANIZATION($,'SPbGASU',$,$,$);`,
      `#${pPersonAndOrg}=IFCPERSONANDORGANIZATION(#${pPerson},#${pOrg},$);`,
      `#${pApp}=IFCAPPLICATION(#${pOrg},'1.0','VentModeller','VentModeller');`,
      `#${pOwnerHist}=IFCOWNERHISTORY(#${pPersonAndOrg},#${pApp},$,.ADDED.,$,$,$,1716960000);`,
      `#${uLength}=IFCSIUNIT($,.LENGTHUNIT.,$,.METRE.);`,
      `#${uArea}=IFCSIUNIT($,.AREAUNIT.,$,.SQUARE_METRE.);`,
      `#${uVolume}=IFCSIUNIT($,.VOLUMEUNIT.,$,.CUBIC_METRE.);`,
      `#${uAssign}=IFCUNITASSIGNMENT((#${uLength},#${uArea},#${uVolume}));`,
      `#${pProj}=IFCPROJECT('3DprojGuid',#${pOwnerHist},'${projectName}',$,$,$,$,(#${geomContext}),#${uAssign});`,
      `#${geomContext}=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${wAxis},$);`,
      `#${wAxis}=IFCAXIS2PLACEMENT3D(#${wPoint},$,$);`,
      `#${wPoint}=IFCCARTESIANPOINT((0.,0.,0.));`,
      `#${pSite}=IFCSITE('SiteGuid',#${pOwnerHist},'Ventilation Site',$,$,$,$,$,.ELEMENT.,$,$,$,$,$);`,
      `#${pBuilding}=IFCBUILDING('BuildingGuid',#${pOwnerHist},'Ventilation Building',$,$,$,$,$,.ELEMENT.,$,$,$);`,
      `#${pStorey}=IFCBUILDINGSTOREY('StoreyGuid',#${pOwnerHist},'Level 0',$,$,$,$,$,.ELEMENT.,0.);`
    ];

    const elementIds: number[] = [];
    const localZDirection = getNextId();
    stepLines.push(`#${localZDirection}=IFCDIRECTION((0.,0.,1.));`);

    for (const elem of elements) {
      if (elem.type === "duct") {
        const startX = elem.start[0] / 1000;
        const startY = elem.start[1] / 1000;
        const startZ = elem.start[2] / 1000;
        const endX = elem.end[0] / 1000;
        const endY = elem.end[1] / 1000;
        const endZ = elem.end[2] / 1000;

        const dx = endX - startX;
        const dy = endY - startY;
        const dz = endZ - startZ;
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (length < 0.01) continue;

        // Создаем геометрическое представление воздуховода
        const ptStart = getNextId();
        const dirExtrude = getNextId();
        const axis2Placement = getNextId();
        const profile = getNextId();
        const extrSolid = getNextId();
        const shapeRep = getNextId();
        const prodShape = getNextId();
        const locPlacement = getNextId();
        const axisPlacementWorld = getNextId();
        const ductId = getNextId();

        // 1. Точка начала и направление
        stepLines.push(`#${ptStart}=IFCCARTESIANPOINT((${startX.toFixed(4)},${startY.toFixed(4)},${startZ.toFixed(4)}));`);
        stepLines.push(`#${dirExtrude}=IFCDIRECTION((${ (dx/length).toFixed(4) },${ (dy/length).toFixed(4) },${ (dz/length).toFixed(4) }));`);
        
        // 2. Локальная ось (выравнивание)
        stepLines.push(`#${axis2Placement}=IFCAXIS2PLACEMENT3D(#${wPoint},#${dirExtrude},$);`);
        stepLines.push(`#${axisPlacementWorld}=IFCAXIS2PLACEMENT3D(#${ptStart},#${dirExtrude},$);`);
        
        // 3. Выбор профиля сечения
        if (elem.shape === "round") {
          const r = (elem.size.d || 200) / 2 / 1000;
          stepLines.push(`#${profile}=IFCCIRCLEPROFILEDEF(.AREA.,$,$,${r.toFixed(4)});`);
        } else {
          const w = (elem.size.w || 300) / 1000;
          const h = (elem.size.h || 200) / 1000;
          stepLines.push(`#${profile}=IFCRECTANGLEPROFILEDEF(.AREA.,$,$,${w.toFixed(4)},${h.toFixed(4)});`);
        }

        // 4. Твердое тело выдавливания (Sweep Solid)
        stepLines.push(`#${extrSolid}=IFCEXTRUDEDAREASOLID(#${profile},#${wAxis},#${localZDirection},${length.toFixed(4)});`);
        
        // 5. Представление формы
        stepLines.push(`#${shapeRep}=IFCSHAPEREPRESENTATION(#${geomContext},'Body','SweptSolid',(#${extrSolid}));`);
        stepLines.push(`#${prodShape}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRep}));`);
        
        // 6. Размещение в пространстве
        stepLines.push(`#${locPlacement}=IFCLOCALPLACEMENT($,#${axisPlacementWorld});`);

        // 7. Сам воздуховод (IfcDuctSegment)
        const name = elem.shape === "round" ? `Duct Round d${elem.size.d}` : `Duct Rect ${elem.size.w}x${elem.size.h}`;
        stepLines.push(`#${ductId}=IFCDUCTSEGMENT('${elem.id}',#${pOwnerHist},'${name}',$,$,#${locPlacement},#${prodShape},$,$);`);

        elementIds.push(ductId);
      }
      else if (elem.type === "fitting") {
        const x = elem.node[0] / 1000;
        const y = elem.node[1] / 1000;
        const z = elem.node[2] / 1000;

        const ptNode = getNextId();
        const axisPlacement = getNextId();
        const locPlacement = getNextId();
        const geomSolid = getNextId();
        const shapeRep = getNextId();
        const prodShape = getNextId();
        const fittingId = getNextId();

        stepLines.push(`#${ptNode}=IFCCARTESIANPOINT((${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}));`);
        stepLines.push(`#${axisPlacement}=IFCAXIS2PLACEMENT3D(#${ptNode},$,$);`);
        stepLines.push(`#${locPlacement}=IFCLOCALPLACEMENT($,#${axisPlacement});`);

        // Фасонное изделие: круглые аппроксимируются сферами, прямоугольные - боксами
        const isRect = elem.size?.w !== undefined;
        if (isRect) {
          const w = (elem.size.w || 300) / 1000;
          const h = (elem.size.h || 200) / 1000;
          const boxPoint = getNextId();
          const boxPlacement = getNextId();
          
          stepLines.push(`#${boxPoint}=IFCCARTESIANPOINT((${-w/2},${-h/2},${-w/2}));`);
          stepLines.push(`#${boxPlacement}=IFCAXIS2PLACEMENT3D(#${boxPoint},$,$);`);
          stepLines.push(`#${geomSolid}=IFCBOUNDINGBOX(#${boxPlacement},${w.toFixed(4)},${h.toFixed(4)},${w.toFixed(4)});`);
        } else {
          const r = ((elem.size?.d || 200) / 2 / 1000) * 1.1;
          stepLines.push(`#${geomSolid}=IFCSPHERE(#${wAxis},${r.toFixed(4)});`);
        }

        stepLines.push(`#${shapeRep}=IFCSHAPEREPRESENTATION(#${geomContext},'Body',${isRect ? "'BoundingBox'" : "'SweptSolid'"},(#${geomSolid}));`);
        stepLines.push(`#${prodShape}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRep}));`);

        const name = `${elem.kind.toUpperCase()} ${elem.sortamentRef}`;
        stepLines.push(`#${fittingId}=IFCDUCTFITTING('${elem.id}',#${pOwnerHist},'${name}',$,$,#${locPlacement},#${prodShape},$,$);`);

        elementIds.push(fittingId);
      }
      else if (elem.type === "terminal") {
        const x = elem.position[0] / 1000;
        const y = elem.position[1] / 1000;
        const z = elem.position[2] / 1000;

        const ptPos = getNextId();
        const axisPlacement = getNextId();
        const locPlacement = getNextId();
        const geomSolid = getNextId();
        const shapeRep = getNextId();
        const prodShape = getNextId();
        const terminalId = getNextId();

        stepLines.push(`#${ptPos}=IFCCARTESIANPOINT((${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}));`);
        stepLines.push(`#${axisPlacement}=IFCAXIS2PLACEMENT3D(#${ptPos},$,$);`);
        stepLines.push(`#${locPlacement}=IFCLOCALPLACEMENT($,#${axisPlacement});`);

        // Воздухораспределитель: тонкая коробка (решетка) или диск-цилиндр (диффузор)
        if (elem.kind === "grille") {
          const boxPoint = getNextId();
          const boxPlacement = getNextId();
          stepLines.push(`#${boxPoint}=IFCCARTESIANPOINT((-0.15,-0.01,-0.1));`);
          stepLines.push(`#${boxPlacement}=IFCAXIS2PLACEMENT3D(#${boxPoint},$,$);`);
          stepLines.push(`#${geomSolid}=IFCBOUNDINGBOX(#${boxPlacement},0.3,0.02,0.2);`);
        } else {
          // Диффузор
          stepLines.push(`#${geomSolid}=IFCSPHERE(#${wAxis},0.12);`);
        }

        stepLines.push(`#${shapeRep}=IFCSHAPEREPRESENTATION(#${geomContext},'Body',${elem.kind === "grille" ? "'BoundingBox'" : "'SweptSolid'"},(#${geomSolid}));`);
        stepLines.push(`#${prodShape}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRep}));`);
        
        stepLines.push(`#${terminalId}=IFCAIRTERMINAL('${elem.id}',#${pOwnerHist},'${elem.model}',$,$,#${locPlacement},#${prodShape},$,$);`);

        elementIds.push(terminalId);
      }
      else if (elem.type === "equipment") {
        const x = elem.position[0] / 1000;
        const y = elem.position[1] / 1000;
        const z = elem.position[2] / 1000;

        const ptPos = getNextId();
        const dirRot = getNextId();
        const axisPlacement = getNextId();
        const locPlacement = getNextId();
        const boxPoint = getNextId();
        const boxPlacement = getNextId();
        const geomSolid = getNextId();
        const shapeRep = getNextId();
        const prodShape = getNextId();
        const eqId = getNextId();

        const rotRad = (elem.rotation * Math.PI) / 180;
        
        stepLines.push(`#${ptPos}=IFCCARTESIANPOINT((${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}));`);
        stepLines.push(`#${dirRot}=IFCDIRECTION((${Math.cos(rotRad).toFixed(4)},0.,${Math.sin(rotRad).toFixed(4)}));`);
        stepLines.push(`#${axisPlacement}=IFCAXIS2PLACEMENT3D(#${ptPos},$,#${dirRot});`);
        stepLines.push(`#${locPlacement}=IFCLOCALPLACEMENT($,#${axisPlacement});`);

        // Вентустановка: коробка 1.2 x 0.6 x 0.6 м
        stepLines.push(`#${boxPoint}=IFCCARTESIANPOINT((-0.6, 0., -0.3));`);
        stepLines.push(`#${boxPlacement}=IFCAXIS2PLACEMENT3D(#${boxPoint},$,$);`);
        stepLines.push(`#${geomSolid}=IFCBOUNDINGBOX(#${boxPlacement},1.2,0.6,0.6);`);

        stepLines.push(`#${shapeRep}=IFCSHAPEREPRESENTATION(#${geomContext},'Body','BoundingBox',(#${geomSolid}));`);
        stepLines.push(`#${prodShape}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRep}));`);
        
        stepLines.push(`#${eqId}=IFCUNITARYEQUIPMENT('${elem.id}',#${pOwnerHist},'${elem.model}',$,$,#${locPlacement},#${prodShape},$,.AIRHANDLINGUNIT.);`);

        elementIds.push(eqId);
      }
    }

    // Соединяем все элементы пространственной структуры с Storey
    if (elementIds.length > 0) {
      const relContained = getNextId();
      const elementsList = elementIds.map(id => `#${id}`).join(",");
      stepLines.push(`#${relContained}=IFCRELCONTAINEDINSPATIALSTRUCTURE('ContainedRelGuid',#${pOwnerHist},'Storey Container',$,(#${elementsList}),#${pStorey});`);
    }

    // Добавляем связи агрегации
    const relAggProjSite = getNextId();
    const relAggSiteBuilding = getNextId();
    const relAggBuildingStorey = getNextId();

    stepLines.push(`#${relAggProjSite}=IFCRELAGGREGATES('ProjSiteGuid',#${pOwnerHist},'ProjectToSite',$,#${pProj},(#${pSite}));`);
    stepLines.push(`#${relAggSiteBuilding}=IFCRELAGGREGATES('SiteBuildGuid',#${pOwnerHist},'SiteToBuilding',$,#${pSite},(#${pBuilding}));`);
    stepLines.push(`#${relAggBuildingStorey}=IFCRELAGGREGATES('BuildStoreyGuid',#${pOwnerHist},'BuildingToStorey',$,#${pBuilding},(#${pStorey}));`);

    stepLines.push(`ENDSEC;`);
    stepLines.push(`END-ISO-10303-21;`);

    return stepLines.join("\n");
  }
}
