-- Expand structural_lookup with ashrama, life-stage, stri-dharma, and
-- family-dharma anchors. These are the topics that currently return nothing
-- from L3 and produce generic answers. book_chapter for Bhagavatam rows
-- uses the skandha×1000+chapter encoding (e.g. 7011 = Sk7 Ch11).

INSERT INTO structural_lookup
  (label, intent_keywords, text_source, book_chapter, verse_start, verse_end)
VALUES
  -- Vanaprastha: elder stage, life after 50, gradual withdrawal
  (
    'Elder Stage — Vanaprastha Duties',
    ARRAY['vanaprastha','elder','fifty','retirement','old','aging','grandparent','withdraw','grandchildren','withdrawn','elderly','senior','later life'],
    'srimad_bhagavatam', 7011, 1, 20
  ),
  -- Grihastha: householder duties, family life
  (
    'Householder Dharma — Grihastha',
    ARRAY['grihastha','householder','family','household','home','married','marriage','domestic','spouse','husband','wife','household duties','homemaker'],
    'srimad_bhagavatam', 7011, 1, 20
  ),
  -- Stri dharma: women's specific duties in the texts
  (
    'Women''s Dharma — Stri Dharma',
    ARRAY['woman','women','wife','daughter','mother','stri','pativrata','female','gender','feminine','girl','daughters','mothers','sisters'],
    'srimad_bhagavatam', 7011, 26, 29
  ),
  -- Sannyasa: renunciation, letting go of worldly roles
  (
    'Renunciation — Sannyasa',
    ARRAY['sannyasa','renunciation','renounce','monk','ascetic','letting go','give up','detach','surrender','tyaga','renunciant','worldly','release'],
    'bhagavad_gita', 18, 1, 12
  ),
  -- Four ashramas: brahmacharya / grihastha / vanaprastha / sannyasa overview
  (
    'Four Stages of Life — Ashrama Dharma',
    ARRAY['ashrama','stages','brahmacharya','student','phases','life stages','transition','maturity','varna','dharmic path','stage of life'],
    'srimad_bhagavatam', 11017, 1, 30
  ),
  -- Seva and purpose in elder years
  (
    'Service and Purpose in Elder Years',
    ARRAY['seva','service','serve','contribution','give back','purpose','meaning','useful','legacy','significance','elder service','wisdom','guidance'],
    'srimad_bhagavatam', 11000, 1, 50
  ),
  -- Aging body vs eternal self
  (
    'Aging Body and the Eternal Self',
    ARRAY['aging','old age','body','decline','illness','physical','mortal','frail','degenerate','flesh','deteriorate','decay','impermanent'],
    'bhagavad_gita', 2, 13, 22
  ),
  -- Marital harmony and relationship dharma
  (
    'Marital Harmony and Relationship Dharma',
    ARRAY['marriage','marital','relationship','love','commitment','vows','partner','together','harmony','discord','conflict spouse','couple','wedlock'],
    'srimad_bhagavatam', 9000, 1, 30
  ),
  -- Parenting and raising children
  (
    'Parenting — Raising Children with Dharma',
    ARRAY['child','children','parenting','son','daughter','raise','educate','upbringing','teach','nurture','kids','offspring','raising','boys','girls'],
    'srimad_bhagavatam', 7007, 1, 15
  ),
  -- Family conflict: duty to parents, siblings, relatives
  (
    'Family Conflict and Obligation to Kin',
    ARRAY['family conflict','parents','obligation','relative','kin','brother','sister','sibling','filial','care','duty family','aging parents','responsibility','caregiver'],
    'bhagavad_gita', 1, 26, 47
  ),
  -- Desire, craving, and compulsion
  (
    'Desire and Its Destruction — Kama',
    ARRAY['desire','craving','lust','want','longing','compulsion','addiction','obsession','attachment desire','greed','kama','tanha','yearning'],
    'bhagavad_gita', 3, 36, 43
  ),
  -- Ego, pride, and self-importance
  (
    'Ego and Ahamkara — The False Self',
    ARRAY['ego','pride','arrogance','self importance','ahamkara','vanity','conceit','status','prestige','identity','superiority','self image','false self'],
    'bhagavad_gita', 16, 4, 18
  )
ON CONFLICT DO NOTHING;
