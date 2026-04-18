// src/domain/lead/enums/LeadType.ts

export enum LeadType {
  CORE_ELETRICA = 'core_eletrica',
  CORE_ENGENHARIA = 'core_engenharia',
  CORE_CONSTRUCAO = 'core_construcao',
  PARCERIA_OBRA = 'parceria_obra',
  CONDOMINIO = 'condominio',
  OUTROS = 'outros',
}

export function cnaeToLeadType(cnae: string | null): LeadType {
  switch (cnae) {
    case '4321500': return LeadType.CORE_ELETRICA;
    case '7112000': return LeadType.CORE_ENGENHARIA;
    case '4120400': return LeadType.CORE_CONSTRUCAO;
    case '4399101': return LeadType.PARCERIA_OBRA;
    case '8112500': return LeadType.CONDOMINIO;
    default:        return LeadType.OUTROS;
  }
}
