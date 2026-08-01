import { privacyPolicyDocument } from './content/privacy-policy.js'
import { professionalTermsDocument } from './content/professional-terms.js'
import { CONSUMER_TERMS_VERSION, termsOfUseDocument } from './content/terms-of-use.js'

export { CONSUMER_TERMS_VERSION }
export { PROFESSIONAL_TERMS_CONTENT_VERSION } from './content/professional-terms.js'

export const legalService = {
  getTermsOfUse() {
    return termsOfUseDocument
  },

  getPrivacyPolicy() {
    return privacyPolicyDocument
  },

  getProfessionalTerms() {
    return professionalTermsDocument
  },

  getAll() {
    return {
      version: CONSUMER_TERMS_VERSION,
      termsOfUse: termsOfUseDocument,
      privacyPolicy: privacyPolicyDocument,
      professionalTerms: professionalTermsDocument,
    }
  },
}
