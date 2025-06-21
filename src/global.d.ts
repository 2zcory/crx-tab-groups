/// <reference types="vite/client" />

declare const __APP_VERSION__: string

namespace NCommon {
  interface Option<Value extends (number | string) = string> {
    value: Value;
    label: string;
  }
}
