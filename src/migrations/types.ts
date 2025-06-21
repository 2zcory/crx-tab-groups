import ESchemeVersion from "./scheme-version.enum";

export interface IInputData {
  [key: string]: any
}

export type MigrateType = "sync" | "local"

export interface IMigration extends Partial<Record<ESchemeVersion, (data: IInputData) => IInputData>> { }
