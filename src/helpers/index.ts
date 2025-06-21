import { C_URL_SERVICES } from "@/constants";

export const extractDomainNameFromUrl = (url: string) => {
  const urlService = C_URL_SERVICES.find(c => url.includes(c))

  if (urlService) return urlService

  try {
    const hostname = new URL(url).hostname

    return hostname
  } catch (e) {
    return null // Invalid URL
  }
}
