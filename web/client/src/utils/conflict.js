import yaml from 'js-yaml'

export const yamlFormatter = {
  format(obj) {
    const orderedObj = {}
    const keyOrder = ['yield', 'etymology', 'cognate_family', 'application', 'nuance']
    for (const k of keyOrder) {
      if (obj && obj[k] !== undefined) orderedObj[k] = obj[k]
    }
    if (obj && typeof obj === 'object') {
      for (const k of Object.keys(obj)) {
        if (!keyOrder.includes(k)) orderedObj[k] = obj[k]
      }
    }
    return yaml.dump(orderedObj, {
      lineWidth: -1,
      noRefs: true,
      quotingType: '"',
      forceQuotes: false,
      sortKeys: false
    })
  }
}

export const deepDiffAdapter = {
  getBadges(diffs) {
    if (!diffs || !Array.isArray(diffs) || diffs.length === 0) return []
    return diffs.map(d => {
      const path = d.path ? d.path.join('.') : 'root'
      let cls = 'bg-slate-100 text-slate-600 border-slate-200'
      if (d.kind === 'N') cls = 'bg-green-100 text-green-700 border-green-200'
      if (d.kind === 'D') cls = 'bg-red-100 text-red-700 border-red-200'
      if (d.kind === 'E') cls = 'bg-yellow-100 text-yellow-700 border-yellow-200'
      if (d.kind === 'A') cls = 'bg-indigo-100 text-indigo-700 border-indigo-200'
      return { path, cls }
    })
  },
  getModules(diffs) {
    if (!diffs || !Array.isArray(diffs) || diffs.length === 0) return []
    const set = new Set()
    for (const d of diffs) {
      const top = Array.isArray(d.path) && d.path.length ? String(d.path[0]) : 'root'
      set.add(top)
    }
    const known = ['yield', 'etymology', 'cognate_family', 'application', 'nuance']
    const ordered = []
    for (const k of known) if (set.has(k)) ordered.push(k)
    for (const k of Array.from(set)) if (!known.includes(k)) ordered.push(k)
    return ordered
  }
}

