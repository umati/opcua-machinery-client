import { 
    AttributeIds, 
    BrowseDescriptionLike, 
    BrowseDirection, 
    ClientSession, 
    DataTypeIds, 
    DataValue, 
    LocalizedText, 
    QualifiedName, 
    ReadValueIdOptions, 
    ReferenceDescription, 
    ReferenceTypeIds, 
    StatusCodes 
} from "node-opcua";
import { UaMachineryComponent } from "./ua-machine-component";
import { makeNodeIdStringFromExpandedNodeId } from "./ua-helper";

export class UaMachineryMachine {

    session: ClientSession
    nodeId: string
    attributes: Map<string, any> = new Map()
    references: Map<string, any> = new Map()
    identification: Map<string, any> = new Map()
    components: Map<string, any> = new Map()
    itemState: string = "unknown"
    operationMode: string = "unknown"
    operationCounters: any = null
    lifetimeCounters: any = null

    _components: ReferenceDescription[] = []
    _addIns: ReferenceDescription[] = []

    constructor(session: ClientSession, nodeId: string) {
        this.session = session
        this.nodeId = nodeId
    }

    async initialize() {
        const readResults: DataValue[] = await this.session!.read([
            {
                nodeId: this.nodeId,
                attributeId: AttributeIds.DisplayName
            } as ReadValueIdOptions,
            {
                nodeId: this.nodeId,
                attributeId: AttributeIds.BrowseName
            } as ReadValueIdOptions,
            {
                nodeId: this.nodeId,
                attributeId: AttributeIds.Description
            } as ReadValueIdOptions,
        ])
        if (readResults[0].statusCode.value === StatusCodes.Good.value) {
            this.attributes.set("DisplayName", (readResults[0].value.value as LocalizedText).text)
        }
        if (readResults[1].statusCode.value === StatusCodes.Good.value) {
            this.attributes.set("BrowseName", (readResults[1].value.value as QualifiedName).toString())
        }
        if (readResults[2].statusCode.value === StatusCodes.Good.value) {
            this.attributes.set("Description", (readResults[2].value.value as LocalizedText).text)
        }
        await this.loadMachineTypeDefinition()
        const addIns = await this.getAddIns()
        if (addIns !== null) {
            this._addIns = addIns
        }
        const components = await this.getComponents()
        if (components !== null) {
            this._components = components
        }
        await this.discoverMachine()
    }

    async discoverMachine() {
        await this.loadMachineIdentification()
        await this.loadMachineComponents()
    }

    async loadMachineTypeDefinition() {
        const browseResult = await this.session!.browse({
            // nodeId?: (NodeIdLike | null);
            // browseDirection?: BrowseDirection;
            // referenceTypeId?: (NodeIdLike | null);
            // includeSubtypes?: UABoolean;
            // nodeClassMask?: UInt32;
            // resultMask?: UInt32;
            nodeId: this.nodeId,
            browseDirection: BrowseDirection.Forward,
            referenceTypeId: ReferenceTypeIds.HasTypeDefinition
        } as BrowseDescriptionLike)
        if (browseResult.references!.length > 1) {
            console.warn(`Machine-Instance '${this.nodeId}' as more then one TypeDefinition-Reference!`)
        }
        const typeDefinitionReadResult: DataValue = await this.session.read({
            nodeId: browseResult.references![0].nodeId,
            attributeId: AttributeIds.DisplayName
        })
        this.references.set("TypeDefinition", (typeDefinitionReadResult.value.value as LocalizedText).text) 
    }

    async getAddIns(): Promise<ReferenceDescription[] | null> {
        const browseResult = await this.session!.browse({
            // nodeId?: (NodeIdLike | null);
            // browseDirection?: BrowseDirection;
            // referenceTypeId?: (NodeIdLike | null);
            // includeSubtypes?: UABoolean;
            // nodeClassMask?: UInt32;
            // resultMask?: UInt32;
            nodeId: this.nodeId,
            browseDirection: BrowseDirection.Forward,
            referenceTypeId: ReferenceTypeIds.HasAddIn
        } as BrowseDescriptionLike)
        return browseResult.references
    }

    async getComponents(): Promise<ReferenceDescription[] | null> {
        const browseResult = await this.session!.browse({
            // nodeId?: (NodeIdLike | null);
            // browseDirection?: BrowseDirection;
            // referenceTypeId?: (NodeIdLike | null);
            // includeSubtypes?: UABoolean;
            // nodeClassMask?: UInt32;
            // resultMask?: UInt32;
            nodeId: this.nodeId,
            browseDirection: BrowseDirection.Forward,
            referenceTypeId: ReferenceTypeIds.HasComponent
        } as BrowseDescriptionLike)
        return browseResult.references
    }

    async loadMachineIdentification() {
        if (this._addIns === null) return
        if (this._addIns.length === 0) return
        for (let index = 0; index < this._addIns.length; index++) {
            const id = this._addIns[index].nodeId;
            const readResult = await this.session.read({
                nodeId: id,
                attributeId: AttributeIds.BrowseName
            })
            if (readResult.statusCode.value === StatusCodes.Good.value) {
                if ((readResult.value.value as QualifiedName).name === "Identification") {
                    const identificationBrowseResults = await this.session.browse({
                        // nodeId?: (NodeIdLike | null);
                        // browseDirection?: BrowseDirection;
                        // referenceTypeId?: (NodeIdLike | null);
                        // includeSubtypes?: UABoolean;
                        // nodeClassMask?: UInt32;
                        // resultMask?: UInt32;
                        nodeId: id,
                        browseDirection: BrowseDirection.Forward,
                        referenceTypeId: ReferenceTypeIds.HasProperty
                    } as BrowseDescriptionLike)
                    if (identificationBrowseResults.statusCode.value === StatusCodes.Good.value) {
                        for (let index = 0; index < identificationBrowseResults.references!.length; index++) {
                            const id = identificationBrowseResults.references![index].nodeId;
                            const readResults = await this.session.read([
                                {
                                    nodeId: id,
                                    attributeId: AttributeIds.Value
                                } as ReadValueIdOptions,
                                {
                                    nodeId: id,
                                    attributeId: AttributeIds.DisplayName
                                } as ReadValueIdOptions,
                            ])
                            if (readResults[0].statusCode.value === StatusCodes.Good.value) {
                                let value
                                switch (readResults[0].value.dataType.valueOf()) {
                                    case DataTypeIds.LocalizedText.valueOf():
                                        value = (readResults[0].value.value as LocalizedText).text
                                        break;
                                    default:
                                        value = readResults[0].value.value
                                        break;
                                }
                                this.identification.set(`${(readResults[1].value.value as LocalizedText).text}`, value)
                            }
                        }
                    }
                }
            }
        }
    }

    async loadMachineComponents() {
        if (this._addIns === null) return
        if (this._addIns.length === 0) return
        for (let index = 0; index < this._addIns.length; index++) {
            const id = this._addIns[index].nodeId;
            const readResult = await this.session.read({
                nodeId: id,
                attributeId: AttributeIds.BrowseName
            })
            if (readResult.statusCode.value === StatusCodes.Good.value) {
                if ((readResult.value.value as QualifiedName).name === "Components") {
                    const componentBrowseResults = await this.session.browse({
                        // nodeId?: (NodeIdLike | null);
                        // browseDirection?: BrowseDirection;
                        // referenceTypeId?: (NodeIdLike | null);
                        // includeSubtypes?: UABoolean;
                        // nodeClassMask?: UInt32;
                        // resultMask?: UInt32;
                        nodeId: id,
                        browseDirection: BrowseDirection.Forward,
                        referenceTypeId: ReferenceTypeIds.HasComponent
                    } as BrowseDescriptionLike)
                    if (componentBrowseResults.statusCode.value === StatusCodes.Good.value) {
                        for (let index = 0; index < componentBrowseResults.references!.length; index++) {
                            const id = componentBrowseResults.references![index].nodeId;
                            const component = new UaMachineryComponent(this.session, makeNodeIdStringFromExpandedNodeId(id))
                            await component.initialize()
                            this.components.set(`${id}`, component)
                        }
                    }
                }
            }
        }
    }

    toJSON() {
        return {
            NodeId: this.nodeId,
            Attributes: Object.fromEntries(this.attributes.entries()),
            References: Object.fromEntries(this.references.entries()),
            Identification: Object.fromEntries(this.identification.entries()),
            Components: Array.from(this.components.values()).map((c) => {return c.toJSON()}),
            MachineryItemState: this.itemState,
            MachineryOperationMode: this.operationMode,
            Monitoring: null
        }
    }
}