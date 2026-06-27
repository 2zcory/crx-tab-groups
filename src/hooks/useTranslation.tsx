import React, { createContext, useContext, useMemo } from 'react'
import { TRANSLATIONS, TranslationKey, LanguageKey } from '@/constants/translations'

interface TranslationContextType {
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string
  language: 'system' | 'en' | 'vi'
  resolvedLanguage: LanguageKey
}

const TranslationContext = createContext<TranslationContextType | undefined>(undefined)

const resolveLanguage = (lang: 'system' | 'en' | 'vi'): LanguageKey => {
  if (lang === 'en' || lang === 'vi') return lang

  // Check Chrome UI language
  if (typeof chrome !== 'undefined' && chrome.i18n) {
    const uiLang = chrome.i18n.getUILanguage().toLowerCase()
    if (uiLang.startsWith('vi')) {
      return 'vi'
    }
  }

  // Fallback to browser navigator language if running in a regular web context
  if (typeof navigator !== 'undefined') {
    const navLang = navigator.language.toLowerCase()
    if (navLang.startsWith('vi')) {
      return 'vi'
    }
  }

  return 'en'
}

interface TranslationProviderProps {
  language: 'system' | 'en' | 'vi'
  children: React.ReactNode
}

export const TranslationProvider: React.FC<TranslationProviderProps> = ({
  language,
  children,
}) => {
  const resolvedLanguage = useMemo(() => resolveLanguage(language), [language])

  const t = useMemo(() => {
    return (key: TranslationKey, variables?: Record<string, string | number>): string => {
      const dictionary = TRANSLATIONS[resolvedLanguage]
      // Use resolved language dictionary, fallback to English dictionary, fallback to key string
      const template = (dictionary as any)[key] || (TRANSLATIONS.en as any)[key] || String(key)

      if (!variables) return template

      return Object.entries(variables).reduce((acc, [varName, varValue]) => {
        return acc.replace(new RegExp(`{${varName}}`, 'g'), String(varValue))
      }, template)
    }
  }, [resolvedLanguage])

  const contextValue = useMemo(
    () => ({
      t,
      language,
      resolvedLanguage,
    }),
    [t, language, resolvedLanguage],
  )

  return (
    <TranslationContext.Provider value={contextValue}>{children}</TranslationContext.Provider>
  )
}

export const useTranslation = () => {
  const context = useContext(TranslationContext)
  if (!context) {
    throw new Error('useTranslation must be used within a TranslationProvider')
  }
  return context
}
