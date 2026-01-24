import yaml
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from models import Base, Word, Etymology, Cognate, Example, Synonym

# Sample YAML Data (as provided by user)
SAMPLE_YAML = """
yield: 
  user_word: "household" 
  lemma: "household" 
  syllabification: "house-hold" 
  user_context_sentence: "The entire household gathered in the living room to celebrate their grandfather's birthday." 
  part_of_speech: "Noun (Collective)" 
  contextual_meaning: 
    en: "A group of people, often a family, who live together in the same dwelling and share meals or living space." 
    zh: "（共同居住的）一家人，一户；家庭（包括所有同住者）。" 
  other_common_meanings: 
    - "Domestic management or affairs (e.g., household expenses)." 
    - "Familiar or common (adj), as in 'a household name'." 

etymology: 
  root_and_affixes: 
    prefix: "N/A" 
    root: "Compound Word: House + Hold" 
    suffix: "N/A" 
    structure_analysis: "Composite of 'House' (dwelling) + 'Hold' (possession/custody). Originally meant 'management of a house'." 
  historical_origins: 
    history_myth: "In Medieval England, a 'household' was not just parents and children, but a functional economic unit including servants and apprentices, all 'held' under one authority." 
    source_word: "Middle English 'houshold' (14c.)" 
    pie_root: "House: *(s)keu- (to cover/hide); Hold: *kel- (to drive/tend cattle) or Germanic *haldan (to watch over)." 
  
  visual_imagery_zh: | 
    想象你站在一片荒野中，正在搭建一个庇护所（House）。 
    1. 场景：你先架起屋顶，用来“覆盖”和“遮蔽”风雨（源自根词 *(s)keu- 的遮盖含义）。 
    2. 动作：不仅是建造，你还要双臂环抱，用力“守住”（Hold）这个空间。你像牧羊人“看管”羊群一样，维持着屋内的秩序和资源。 
    3. 体感：你能感到一种“向心的张力”。屋顶提供了物理的安全感，而你的“把持”确保了屋内的人员和物资不会流散。这种“被覆盖”且“被维系”在一起的状态，就是 Household。 

  meaning_evolution_zh: | 
    最初，这个词侧重于动词性的“持家”或“家务管理”（The holding/keeping of the house）。 
    就像“Hold”不仅意味着“拿”，还意味着“保持状态”（如 hold the line），这个词逐渐从“管理房子的行为”转喻为“被管理的实体”——即住在房子里的所有人。 
    因此，它比“Family”更强调物理空间的共处和经济上的共同体（同在一个屋檐下被维系的一群人）。 

cognate_family: 
  instruction: "请在本板块使用中文。选择 3-4 个同源词。" 
  cognates: 
    - word: "Husband" 
      logic: "House (房屋) + Bond (居住者/耕种者) -> '想象一个男人作为房屋的管理者' = 丈夫（古意为一家之主/农业管理者）。" 
    - word: "Behold" 
      logic: "Be- (加强) + Hold (抓住) -> '想象用眼睛紧紧抓住某个物体' = 注视，看见（把景象保持在视线中）。" 
    - word: "Hide" 
      logic: "源自根词 *(s)keu- (覆盖) -> '想象用兽皮把身体覆盖起来' = 躲藏，兽皮（House 也是一种巨大的覆盖物）。" 

application: 
  selected_examples: 
    - type: "Literal / Root Image" 
      sentence: "She manages the household accounts with great care." 
      translation_zh: "她非常细心地管理着家庭账目（侧重于‘持家/管理’的本义）。" 
    - type: "Current Context" 
      sentence: "According to the census, the average household size has decreased." 
      translation_zh: "根据人口普查，平均每户家庭的人口数量有所减少（侧重于居住单位）。" 
    - type: "Abstract / Metaphorical" 
      sentence: "After the movie's success, the actor became a household name." 
      translation_zh: "那部电影成功后，这位演员成了家喻户晓的名字（字面意：每个家庭都知道的名字）。" 

nuance: 
  synonyms: 
    - word: "Family" 
      meaning_zh: "家庭（侧重血缘和亲属关系）。" 
    - word: "Residence" 
      meaning_zh: "住宅，居所（侧重物理建筑）。" 
  
  image_differentiation_zh: | 
    不同于 **Family** 仅仅暗示“血脉相连”的情感纽带，**Household** 更侧重于“屋檐下的共同运作”。 
    想象 Family 是一张家谱（Blood），你可以住在世界的不同角落； 
    而 Household 是一个有围墙的圆圈（Roof & Control），必须 physically 住在一起，共同分担柴米油盐。这就是为什么人口普查用 Household（住户）而不是 Family，因为它是基于“共同居住”这一动作事实的。 
"""

def parse_and_insert(yaml_str, db_url):
    """
    Parses YAML string and inserts into PostgreSQL using SQLAlchemy.
    """
    data = yaml.safe_load(yaml_str)
    
    # Create Engine & Session
    engine = create_engine(db_url)
    # Ensure tables exist (for testing purposes; in production use migration tool)
    Base.metadata.create_all(engine)
    
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        # 1. Prepare Main Word Entity
        yield_data = data.get('yield', {})
        nuance_data = data.get('nuance', {})
        
        word = Word(
            user_word=yield_data.get('user_word'),
            lemma=yield_data.get('lemma'),
            syllabification=yield_data.get('syllabification'),
            part_of_speech=yield_data.get('part_of_speech'),
            user_context_sentence=yield_data.get('user_context_sentence'),
            contextual_meaning_en=yield_data.get('contextual_meaning', {}).get('en'),
            contextual_meaning_zh=yield_data.get('contextual_meaning', {}).get('zh'),
            other_common_meanings=yield_data.get('other_common_meanings', []),
            image_differentiation_zh=nuance_data.get('image_differentiation_zh'),
            original_yaml=data # Save full JSONB for audit
        )
        session.add(word)
        session.flush() # Flush to get word.id

        # 2. Etymology
        etym_data = data.get('etymology', {})
        roots = etym_data.get('root_and_affixes', {})
        origins = etym_data.get('historical_origins', {})
        
        etymology = Etymology(
            word_id=word.id,
            prefix=roots.get('prefix'),
            root=roots.get('root'),
            suffix=roots.get('suffix'),
            structure_analysis=roots.get('structure_analysis'),
            history_myth=origins.get('history_myth'),
            source_word=origins.get('source_word'),
            pie_root=origins.get('pie_root'),
            visual_imagery_zh=etym_data.get('visual_imagery_zh'),
            meaning_evolution_zh=etym_data.get('meaning_evolution_zh')
        )
        session.add(etymology)

        # 3. Cognates
        cognate_list = data.get('cognate_family', {}).get('cognates', [])
        for cog in cognate_list:
            session.add(Cognate(
                word_id=word.id,
                cognate_word=cog.get('word'),
                logic=cog.get('logic')
            ))

        # 4. Examples
        example_list = data.get('application', {}).get('selected_examples', [])
        for ex in example_list:
            session.add(Example(
                word_id=word.id,
                example_type=ex.get('type'),
                sentence=ex.get('sentence'),
                translation_zh=ex.get('translation_zh')
            ))

        # 5. Synonyms
        synonym_list = nuance_data.get('synonyms', [])
        for syn in synonym_list:
            session.add(Synonym(
                word_id=word.id,
                synonym_word=syn.get('word'),
                meaning_zh=syn.get('meaning_zh')
            ))

        session.commit()
        print(f"Successfully inserted word: {word.lemma} (ID: {word.id})")

    except Exception as e:
        session.rollback()
        print(f"Error occurred: {e}")
        raise
    finally:
        session.close()

if __name__ == "__main__":
    # Get DB URL from env or use default for testing
    # Format: postgresql://user:password@localhost:5432/dbname
    DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/ad_fontes")
    
    print("Starting import...")
    # Uncomment to run if you have a DB ready:
    # parse_and_insert(SAMPLE_YAML, DB_URL)
    print("Import logic ready. Configure DATABASE_URL to run.")
