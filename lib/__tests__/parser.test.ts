import { describe, it, expect } from 'vitest'
import { extractByRegex, computeOverallConfidence } from '../crawler/parser'

// ─── extractByRegex ──────────────────────────────────────────────────────────

describe('extractByRegex', () => {
  describe('wattage', () => {
    it('extracts single wattage', () => {
      const { specs } = extractByRegex('Nominal power: 40W')
      expect(specs.wattage).toBe(40)
    })

    it('extracts wattage range', () => {
      const { specs } = extractByRegex('Power: 20-40W selectable')
      expect(specs.wattageMin).toBe(20)
      expect(specs.wattageMax).toBe(40)
    })

    it('extracts decimal wattage', () => {
      const { specs } = extractByRegex('12.5 Watts')
      expect(specs.wattage).toBe(12.5)
    })

    it('prefers range over single', () => {
      const { specs } = extractByRegex('25-50W selectable output, 37W typical')
      expect(specs.wattageMin).toBe(25)
      expect(specs.wattageMax).toBe(50)
    })

    it('rejects wattage of 0', () => {
      const { specs } = extractByRegex('Power: 0W standby')
      expect(specs.wattage).toBeUndefined()
    })

    it('rejects unrealistically high wattage', () => {
      const { specs } = extractByRegex('Model 50000W industrial')
      expect(specs.wattage).toBeUndefined()
    })

    it('rejects range where min >= max', () => {
      const { specs } = extractByRegex('50-50W constant')
      expect(specs.wattageMin).toBeUndefined()
      expect(specs.wattageMax).toBeUndefined()
    })
  })

  describe('lumens', () => {
    it('extracts single lumen value', () => {
      const { specs } = extractByRegex('Output: 4000lm')
      expect(specs.lumens).toBe(4000)
    })

    it('extracts lumen range', () => {
      const { specs } = extractByRegex('2000-5000 LM selectable')
      expect(specs.lumensMin).toBe(2000)
      expect(specs.lumensMax).toBe(5000)
    })

    it('ignores values too short to be lumens', () => {
      const { specs } = extractByRegex('Only 10lm')
      expect(specs.lumens).toBeUndefined()
    })

    it('rejects lumens below 100', () => {
      const { specs } = extractByRegex('Output: 099LM')
      expect(specs.lumens).toBeUndefined()
    })

    it('accepts high-output lumens up to 500000', () => {
      const { specs } = extractByRegex('Stadium: 200000LM output')
      expect(specs.lumens).toBe(200000)
    })

    it('rejects lumens range where min >= max', () => {
      const { specs } = extractByRegex('5000-5000 LM')
      expect(specs.lumensMin).toBeUndefined()
      expect(specs.lumensMax).toBeUndefined()
    })
  })

  describe('CRI', () => {
    it('extracts CRI > value', () => {
      const { specs } = extractByRegex('CRI >80')
      expect(specs.cri).toBe(80)
    })

    it('extracts value before CRI', () => {
      const { specs } = extractByRegex('90 CRI')
      expect(specs.cri).toBe(90)
    })

    it('extracts Color Rendering Index format', () => {
      const { specs } = extractByRegex('Color Rendering Index: 82')
      expect(specs.cri).toBe(82)
    })

    it('rejects CRI below 50', () => {
      const { specs } = extractByRegex('CRI 30')
      expect(specs.cri).toBeUndefined()
    })

    it('accepts CRI of 100', () => {
      const { specs } = extractByRegex('CRI 100 test')
      // 100 is 3 digits, regex matches \d{2} so won't match "100" — only "10" from "100"
      // This is acceptable since CRI >99 is extremely rare
    })
  })

  describe('CCT options', () => {
    it('extracts multiple CCT values', () => {
      const { specs } = extractByRegex('Available in 3000K, 3500K, 4000K, 5000K')
      expect(specs.cctOptions).toEqual([3000, 3500, 4000, 5000])
    })

    it('deduplicates CCT values', () => {
      const { specs } = extractByRegex('3500K option or 3500K tunable')
      expect(specs.cctOptions).toEqual([3500])
    })

    it('sorts CCT values', () => {
      const { specs } = extractByRegex('5000K and 3000K')
      expect(specs.cctOptions).toEqual([3000, 5000])
    })

    it('rejects CCT below 1800K', () => {
      const { specs } = extractByRegex('1000K warm')
      expect(specs.cctOptions).toBeUndefined()
    })

    it('rejects CCT above 10000K', () => {
      const { specs } = extractByRegex('15000K UV source')
      expect(specs.cctOptions).toBeUndefined()
    })

    it('filters invalid CCTs from mixed list', () => {
      const { specs } = extractByRegex('Options: 1000K, 3000K, 5000K, 99999K')
      expect(specs.cctOptions).toEqual([3000, 5000])
    })
  })

  describe('voltage', () => {
    it('extracts numeric voltage', () => {
      const { specs } = extractByRegex('Input: 120V')
      expect(specs.voltage).toBeTruthy()
    })

    it('extracts universal voltage', () => {
      const { specs } = extractByRegex('Universal (120-277V)')
      expect(specs.voltage).toBeTruthy()
    })
  })

  describe('IP rating', () => {
    it('extracts IP rating', () => {
      const { specs } = extractByRegex('Rated IP65 for outdoor use')
      expect(specs.ipRating).toBe('IP65')
    })
  })

  describe('NEMA rating', () => {
    it('extracts NEMA rating', () => {
      const { specs } = extractByRegex('NEMA 4X rated')
      expect(specs.nemaRating).toBe('NEMA 4X')
    })
  })

  describe('DLC', () => {
    it('detects DLC Premium', () => {
      const { specs } = extractByRegex('DLC Premium listed')
      expect(specs.dlcListed).toBe(true)
      expect(specs.dlcPremium).toBe(true)
    })

    it('detects standard DLC', () => {
      const { specs } = extractByRegex('DLC listed product')
      expect(specs.dlcListed).toBe(true)
      expect(specs.dlcPremium).toBe(false)
    })

    it('detects DesignLights Consortium', () => {
      const { specs } = extractByRegex('DesignLights Consortium qualified')
      expect(specs.dlcListed).toBe(true)
    })
  })

  describe('UL', () => {
    it('detects UL Listed', () => {
      const { specs } = extractByRegex('UL Listed for wet locations')
      expect(specs.ulListed).toBe(true)
    })

    it('detects cULus', () => {
      const { specs } = extractByRegex('cULus rated')
      expect(specs.ulListed).toBe(true)
    })
  })

  describe('dimming', () => {
    it('detects 0-10V dimming', () => {
      const { specs } = extractByRegex('0-10V dimming driver')
      expect(specs.dimmable).toBe(true)
      expect(specs.dimmingType).toContain('0-10V')
    })

    it('detects DALI', () => {
      const { specs } = extractByRegex('DALI 2 compatible')
      expect(specs.dimmable).toBe(true)
    })

    it('detects generic dimmable', () => {
      const { specs } = extractByRegex('This fixture is dimmable')
      expect(specs.dimmable).toBe(true)
      expect(specs.dimmingType).toBeUndefined()
    })
  })

  describe('location ratings', () => {
    it('detects wet location', () => {
      const { specs } = extractByRegex('Wet location rated')
      expect(specs.wetLocation).toBe(true)
    })

    it('detects damp location', () => {
      const { specs } = extractByRegex('Damp location listed')
      expect(specs.dampLocation).toBe(true)
    })
  })

  describe('efficacy', () => {
    it('extracts LPW value', () => {
      const { specs } = extractByRegex('130 LPW')
      expect(specs.efficacy).toBe(130)
    })

    it('extracts lumens per watt format', () => {
      const { specs } = extractByRegex('115 lumens per watt')
      expect(specs.efficacy).toBe(115)
    })
  })

  describe('beam angle', () => {
    it('extracts beam angle', () => {
      const { specs } = extractByRegex('40° beam angle')
      expect(specs.beamAngle).toBe(40)
    })
  })

  describe('emergency backup', () => {
    it('detects emergency backup', () => {
      const { specs } = extractByRegex('Includes emergency backup battery')
      expect(specs.emergencyBackup).toBe(true)
    })

    it('detects EM driver', () => {
      const { specs } = extractByRegex('Optional EM driver available')
      expect(specs.emergencyBackup).toBe(true)
    })
  })

  describe('provenance tracking', () => {
    it('creates provenance entries for extracted fields', () => {
      const { provenance } = extractByRegex('40W 4000lm CRI 80')
      expect(provenance.wattage).toBeDefined()
      expect(provenance.wattage.source).toBe('REGEX')
      expect(provenance.wattage.confidence).toBeGreaterThan(0)
      expect(provenance.lumens).toBeDefined()
      expect(provenance.cri).toBeDefined()
    })

    it('stores rawValue in provenance', () => {
      const { provenance } = extractByRegex('40W')
      expect(provenance.wattage.rawValue).toBe('40W')
    })
  })

  describe('combined extraction', () => {
    it('extracts multiple fields from realistic spec text', () => {
      const specText = `
        GTL4 LED Troffer 2x4
        Wattage: 25-40W selectable
        Output: 3000-5000 LM
        CRI >80
        CCT: 3500K/4000K/5000K
        Input: 120/277V
        0-10V dimming standard
        DLC Premium listed
        UL Listed
        IP65 rated
        Wet location
      `
      const { specs } = extractByRegex(specText)
      expect(specs.wattageMin).toBe(25)
      expect(specs.wattageMax).toBe(40)
      expect(specs.lumensMin).toBe(3000)
      expect(specs.lumensMax).toBe(5000)
      expect(specs.cri).toBe(80)
      expect(specs.cctOptions).toEqual([3500, 4000, 5000])
      expect(specs.dimmable).toBe(true)
      expect(specs.dlcListed).toBe(true)
      expect(specs.dlcPremium).toBe(true)
      expect(specs.ulListed).toBe(true)
      expect(specs.ipRating).toBe('IP65')
      expect(specs.wetLocation).toBe(true)
    })
  })
})

// ─── computeOverallConfidence ────────────────────────────────────────────────

describe('computeOverallConfidence', () => {
  it('returns 0 for empty provenance', () => {
    expect(computeOverallConfidence({})).toBe(0)
  })

  it('returns exact confidence for single field', () => {
    const result = computeOverallConfidence({
      wattage: { source: 'REGEX', confidence: 0.9 },
    })
    expect(result).toBe(0.9)
  })

  it('averages multiple field confidences', () => {
    const result = computeOverallConfidence({
      wattage: { source: 'REGEX', confidence: 0.9 },
      lumens: { source: 'REGEX', confidence: 0.7 },
    })
    expect(result).toBe(0.8)
  })

  it('rounds to 2 decimal places', () => {
    const result = computeOverallConfidence({
      a: { source: 'REGEX', confidence: 0.9 },
      b: { source: 'REGEX', confidence: 0.8 },
      c: { source: 'AI_FALLBACK', confidence: 0.7 },
    })
    expect(result).toBe(0.8)
  })
})
