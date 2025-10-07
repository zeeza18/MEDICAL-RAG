# 🏥 Medical RAG - Nutritional Chatbot

A production-ready Retrieval-Augmented Generation (RAG) system built from scratch for exploring medical nutrition information. This project demonstrates a complete RAG pipeline with PDF ingestion, vector search, and an interactive chat interface powered by OpenAI and Supabase.

## 📋 Overview

This Medical RAG system provides accurate, citation-backed answers to nutrition-related questions by:
- Extracting and chunking content from medical nutrition textbooks (PDF)
- Storing embeddings in Supabase's vector database with pgvector
- Retrieving relevant passages using semantic similarity search
- Generating contextual answers with source citations
- Displaying interactive citations with highlighted matching terms

## ✨ Features

- **📄 PDF Processing**: Automated extraction and intelligent chunking with sentence-based segmentation
- **🔍 Semantic Search**: Vector similarity search using OpenAI embeddings (text-embedding-3-small)
- **💬 Interactive Chat**: Modern, responsive chat interface with real-time responses
- **📌 Citation System**: Inline citations with expandable source previews and keyword highlighting
- **🎯 Context-Aware**: Top-K retrieval with similarity scoring and metadata filtering
- **🎨 Modern UI**: Beautiful Next.js interface with Tailwind CSS and smooth animations
- **🔊 Audio Feedback**: Subtle audio cues for user interactions
- **📱 Responsive Design**: Works seamlessly across desktop and mobile devices

## 🛠️ Tech Stack

### Backend
- **Python 3.x** - Core processing and ingestion
- **OpenAI API** - Text embeddings (text-embedding-3-small, 1536 dimensions) and chat completions
- **Supabase** - PostgreSQL with pgvector for vector storage and similarity search
- **PyMuPDF (fitz)** - PDF text extraction
- **tiktoken** - Token counting and text processing

### Frontend
- **Next.js 14+** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Web Audio API** - Interactive sound feedback

### Key Libraries
- `supabase-py` - Supabase client
- `openai` - OpenAI API client
- `python-dotenv` - Environment management
- `tqdm` - Progress bars

## 📦 Installation

### Prerequisites

- **Python 3.8+** for backend processing
- **Node.js 18+** and npm/yarn for the frontend
- **Supabase Account** with a project created
- **OpenAI API Key** with access to embeddings and chat models

### Backend Setup

1. **Clone the repository**:
```bash
git clone https://github.com/zeeza18/MEDICAL-RAG.git
cd MEDICAL-RAG
```

2. **Install Python dependencies**:
```bash
pip install pymupdf tiktoken supabase openai tqdm python-dotenv
```

3. **Configure environment variables**:
Create a `.env` file in the root directory:
```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_api_key
```

4. **Set up Supabase database**:
Create a table named `chunks` with the following structure:
```sql
CREATE TABLE chunks (
  id BIGSERIAL PRIMARY KEY,
  doc_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  embedding VECTOR(1536)
);

-- Create the similarity search function
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 5,
  filter JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id BIGINT,
  doc_id TEXT,
  chunk_index INTEGER,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $
BEGIN
  RETURN QUERY
  SELECT
    chunks.id,
    chunks.doc_id,
    chunks.chunk_index,
    chunks.content,
    chunks.metadata,
    1 - (chunks.embedding <=> query_embedding) AS similarity
  FROM chunks
  WHERE chunks.metadata @> filter
  ORDER BY chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$;
```

5. **Ingest your PDF document**:
```bash
python ingest.py
```
This will:
- Extract text from `human-nutrition-text.pdf`
- Create sentence-based chunks (20 sentences per chunk, 2 sentence overlap)
- Generate embeddings using OpenAI
- Upload to Supabase with metadata (page numbers, source info)

### Frontend Setup

1. **Navigate to the frontend directory** (if separate):
```bash
cd frontend  # or wherever your Next.js app is located
```

2. **Install Node dependencies**:
```bash
npm install
# or
yarn install
```

3. **Configure Next.js environment**:
Create a `.env.local` file:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
OPENAI_API_KEY=your_openai_api_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

4. **Run the development server**:
```bash
npm run dev
# or
yarn dev
```

5. **Open your browser** at `http://localhost:3000`

## 🚀 Usage

### 1. Data Ingestion

Process and upload your medical PDF to the vector database:

```bash
python ingest.py
```

**Configuration options in `ingest.py`**:
- `PDF_PATH`: Path to your PDF file
- `DOC_ID`: Unique identifier for the document
- `SENTS_PER_CHUNK`: Sentences per chunk (default: 20)
- `SENT_OVERLAP`: Overlapping sentences between chunks (default: 2)
- `MAX_TOKENS`: Maximum tokens per chunk (default: 1300)
- `BATCH_EMBED`: Batch size for embedding generation (default: 100)

### 2. Test Embeddings & Retrieval

Verify your setup and test the retrieval system:

```bash
python test_embeddings.py
```

This will run sample queries against your vector database and display:
- Matched chunks with similarity scores
- Page numbers and chunk indices
- Content previews with keyword matching

**Sample queries tested**:
- "How often should infants be breastfed?"
- "What are symptoms of pellagra?"
- "How does saliva help with digestion?"
- "What is the RDI for protein per day?"

### 3. Launch the Chat Interface

Start the Next.js development server:

```bash
npm run dev
```

Then open your browser at `http://localhost:3000` and start asking questions!

### 4. API Usage (if implementing custom endpoints)

```typescript
// Example API call to the chat endpoint
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    message: "What are water-soluble vitamins?" 
  })
});

const data = await response.json();
console.log(data.answer);    // Generated answer with citations
console.log(data.sources);   // Retrieved source chunks
```

## 📁 Project Structure

```
MEDICAL-RAG/
├── ingest.py                    # PDF processing & vector upload script
├── test_embeddings.py           # Retrieval testing & verification
├── human-nutrition-text.pdf     # Source medical document
├── .env                         # Environment variables (not in repo)
│
├── app/                         # Next.js application
│   ├── layout.tsx              # Root layout with fonts & metadata
│   ├── page.tsx                # Main chat interface component
│   ├── globals.css             # Global styles
│   └── api/
│       └── chat/
│           └── route.ts        # API endpoint for chat completions
│
├── components/                  # Reusable React components (if any)
├── lib/                        # Utility functions
├── public/                     # Static assets
│
├── package.json                # Node.js dependencies
├── tsconfig.json              # TypeScript configuration
├── tailwind.config.js         # Tailwind CSS configuration
├── next.config.js             # Next.js configuration
│
└── README.md                  # This file
```

## 🎯 Key Features Explained

### Intelligent Chunking Strategy

The system uses **sentence-based semantic chunking**:
- Splits text at sentence boundaries (not arbitrary character limits)
- Creates overlapping chunks to preserve context across boundaries
- Enforces token limits (max 1300, min 50) for optimal retrieval
- Handles hyphenation and text cleanup automatically

### Citation & Source Tracking

Every answer includes:
- **Inline citations** like `[1]`, `[2]` that are clickable
- **Source metadata**: page numbers, chunk indices, document IDs
- **Similarity scores**: confidence metrics for each retrieved chunk
- **Interactive previews**: expandable citations with highlighted keywords

### Retrieval Process

1. **Query embedding**: User question → OpenAI embedding (1536 dimensions)
2. **Vector search**: Supabase pgvector finds top-K similar chunks
3. **Metadata filtering**: Results filtered by document source
4. **Context assembly**: Retrieved chunks formatted as context
5. **LLM generation**: OpenAI generates answer with citations
6. **Response streaming**: Answer displayed with clickable sources

## ⚙️ Configuration

### Environment Variables

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key  # For frontend

# OpenAI Configuration
OPENAI_API_KEY=sk-your-api-key
```

### Ingestion Parameters (ingest.py)

```python
# Document settings
PDF_PATH = "human-nutrition-text.pdf"
DOC_ID = "nutrition-v1"

# Embedding model (must match table dimensions)
EMBED_MODEL = "text-embedding-3-small"  # 1536 dimensions

# Chunking strategy
SENTS_PER_CHUNK = 20    # Sentences per chunk
SENT_OVERLAP = 2        # Overlapping sentences
MAX_TOKENS = 1300       # Maximum tokens per chunk
MIN_TOKENS = 50         # Minimum tokens (skip tiny fragments)

# Batch processing
BATCH_EMBED = 100       # Embedding batch size
BATCH_INSERT = 200      # Database insert batch size
```

### Retrieval Parameters (test_embeddings.py)

```python
EMBED_MODEL = "text-embedding-3-small"
TOP_K = 3              # Number of results to retrieve
PDF_PATH = "human-nutrition-text.pdf"  # Metadata filter
```

## 📊 Example Queries & Outputs

### Query: "How does saliva help with digestion?"

**Retrieved Sources**:
```
[1] page 32  sim=0.847  chunk_index=145
    Saliva contains enzymes like amylase that begin breaking down 
    starches in the mouth, initiating the digestive process...

[2] page 33  sim=0.821  chunk_index=148
    The moistening effect of saliva also helps form the food bolus, 
    making it easier to swallow and continue through the digestive tract...
```

**Generated Answer**:
"Saliva plays a crucial role in digestion by containing enzymes like amylase that begin breaking down starches in the mouth [1]. It also moistens food to form a bolus, facilitating swallowing and further digestion [2]."

### Query: "What are symptoms of pellagra?"

**Retrieved Sources**:
```
[1] page 156  sim=0.892  chunk_index=687
    Pellagra is characterized by the "4 Ds": diarrhea, dermatitis, 
    dementia, and death if left untreated. Symptoms include inflamed 
    skin, digestive problems, and mental confusion...
```

**Generated Answer**:
"Pellagra is characterized by the '4 Ds': diarrhea, dermatitis, dementia, and death if untreated [1]. Common symptoms include inflamed skin, digestive issues, and mental confusion [1]."

## 🎨 UI Features

### Modern Chat Interface
- **Gradient backgrounds** with subtle animations
- **Glassmorphism effects** for depth and elegance
- **Responsive grid layout** for source citations
- **Keyboard shortcuts**: Enter to send, Escape to close previews
- **Audio feedback**: Subtle tones for interactions
- **Dark theme** optimized for readability

### Interactive Citations
- Click any `[1]`, `[2]` citation number to preview the source
- **Keyword highlighting** in both sources and previews
- **Similarity scores** displayed for transparency
- **Page references** for easy document navigation
- **Smooth animations** for popover displays

### Suggested Prompts
Pre-loaded example questions to get started:
- "How does the document describe water-soluble vitamins?"
- "Summarize the recommended nutrition for infants."
- "What are the warning signs of pellagra?"
- "Explain how saliva contributes to digestion."

## 🧪 Testing & Validation

### Test Your Retrieval Pipeline

```bash
python test_embeddings.py
```

**What it tests**:
- Embedding generation for queries
- Vector similarity search accuracy
- Metadata filtering functionality
- Top-K retrieval quality
- Content preview generation

**Expected output**:
```
==========================================================================================
QUERY: How often should infants be breastfed?
  [1] page 12  sim=0.876  chunk_index=43
      Infants should be breastfed on demand, typically 8-12 times per day during...
  [2] page 13  sim=0.834  chunk_index=47
      The American Academy of Pediatrics recommends exclusive breastfeeding for...
```

### Manual Testing Checklist

- [ ] PDF ingestion completes without errors
- [ ] Embeddings are generated and stored correctly
- [ ] Retrieval returns relevant results with high similarity scores
- [ ] Citations appear in generated answers
- [ ] Frontend displays sources with correct metadata
- [ ] Interactive citations work smoothly
- [ ] Keyword highlighting appears in source previews

## 🚧 Troubleshooting

### Common Issues

**Issue**: Embeddings fail during ingestion
```bash
# Check your OpenAI API key
echo $OPENAI_API_KEY

# Verify API access
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

**Issue**: Supabase connection errors
```bash
# Test connection
python -c "from supabase import create_client; 
client = create_client('YOUR_URL', 'YOUR_KEY'); 
print('Connected!')"
```

**Issue**: No results returned from search
- Check that `doc_id` in queries matches the one used during ingestion
- Verify embeddings were uploaded: Check Supabase table row count
- Lower similarity threshold if too strict
- Ensure `match_documents` function is created in Supabase

**Issue**: Citations not appearing in answers
- Verify API route is properly formatting sources
- Check that OpenAI response includes citation markers
- Ensure frontend is parsing citation numbers correctly

## 🔧 Customization

### Adding New Documents

1. Place your PDF in the project root
2. Update `PDF_PATH` and `DOC_ID` in `ingest.py`
3. Run ingestion: `python ingest.py`
4. Test retrieval: `python test_embeddings.py`

### Adjusting Chunk Size

Experiment with different chunking parameters:
```python
SENTS_PER_CHUNK = 15  # Smaller chunks, more precise
SENT_OVERLAP = 3      # More overlap, better context
MAX_TOKENS = 1000     # Shorter chunks for faster processing
```

### Changing Embedding Models

To use a different OpenAI model:
```python
# In ingest.py and test_embeddings.py
EMBED_MODEL = "text-embedding-3-large"  # 3072 dimensions

# Update Supabase table:
ALTER TABLE chunks ALTER COLUMN embedding TYPE VECTOR(3072);
```

### Custom Retrieval Logic

Modify the `match_documents` function in Supabase:
```sql
-- Add threshold filtering
WHERE 1 - (chunks.embedding <=> query_embedding) > 0.7

-- Change ranking algorithm
ORDER BY (chunks.embedding <#> query_embedding)  -- inner product

-- Add date filters
WHERE chunks.metadata->>'date' > '2024-01-01'
```

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Ways to Contribute
- 🐛 Report bugs and issues
- 💡 Suggest new features or improvements
- 📝 Improve documentation
- 🎨 Enhance UI/UX design
- ⚡ Optimize performance
- 🧪 Add tests and validations

### Contribution Process

1. **Fork the repository**
2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes** with clear, descriptive commits
4. **Test thoroughly**:
   ```bash
   python test_embeddings.py
   npm run build  # Ensure no build errors
   ```
5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```
6. **Open a Pull Request** with:
   - Clear description of changes
   - Related issue numbers (if applicable)
   - Screenshots for UI changes

### Code Style
- Follow existing code formatting
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions focused and modular

## 🛣️ Roadmap

### Planned Features
- [ ] Multi-document support with source filtering
- [ ] Advanced query understanding with query expansion
- [ ] Conversation history and follow-up questions
- [ ] Export chat transcripts with citations
- [ ] User feedback collection on answer quality
- [ ] Cost tracking and usage analytics
- [ ] Docker containerization for easy deployment
- [ ] Support for more document types (DOCX, TXT, HTML)
- [ ] Multi-language support
- [ ] Integration with other LLM providers (Anthropic, Gemini)

### Performance Optimizations
- [ ] Implement caching for repeated queries
- [ ] Add streaming responses for real-time feedback
- [ ] Optimize batch processing for large documents
- [ ] Add pagination for source results
- [ ] Implement lazy loading for chat history

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

**IMPORTANT MEDICAL DISCLAIMER**: 

This tool is designed for **educational and research purposes only**. It should **NOT** be used as a substitute for:
- Professional medical advice
- Medical diagnosis
- Treatment recommendations
- Clinical decision-making

**Always consult qualified healthcare professionals** for medical questions, concerns, or treatment decisions. The information provided by this system may be incomplete, outdated, or contain errors.

## 🙏 Acknowledgments

### Technologies & Resources
- **OpenAI** - Embedding and language models
- **Supabase** - Vector database and PostgreSQL backend
- **pgvector** - PostgreSQL extension for vector similarity search
- **Next.js Team** - React framework and developer tools
- **Tailwind CSS** - Utility-first CSS framework
- **Open source nutrition textbooks** - Educational content source

### Inspired By
- Academic research in RAG systems for medical applications
- Best practices from the medical NLP community
- User feedback and real-world use cases

## 📧 Contact & Support

### Get Help
- **GitHub Issues**: [Report bugs or request features](https://github.com/zeeza18/MEDICAL-RAG/issues)
- **Discussions**: Share ideas and ask questions
- **Email**: [your-email@example.com]

### Connect
- **GitHub**: [@zeeza18](https://github.com/zeeza18)
- **Twitter**: [@YourHandle]
- **LinkedIn**: [Your Profile]

### Star the Project ⭐
If you find this project helpful, please consider giving it a star on GitHub! It helps others discover the project and motivates continued development.

## 🔗 Related Resources

### Similar Projects
- [MedRAG Toolkit](https://github.com/Teddy-XiongGZ/MedRAG) - Comprehensive medical RAG benchmark
- [Medical-RAG-LLM](https://github.com/AquibPy/Medical-RAG-LLM) - BioMistral-based implementation
- [MMed-RAG](https://github.com/richard-peng-xia/MMed-RAG) - Multimodal medical RAG system

### Learning Resources
- [Supabase Vector Documentation](https://supabase.com/docs/guides/ai/vector-columns)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [RAG Best Practices](https://www.pinecone.io/learn/retrieval-augmented-generation/)
- [Next.js App Router](https://nextjs.org/docs/app)

### Medical NLP Datasets
- [PubMed Central](https://www.ncbi.nlm.nih.gov/pmc/) - Open access biomedical literature
- [MIMIC-III](https://physionet.org/content/mimiciii/) - Critical care database
- [MedQA](https://github.com/jind11/MedQA) - Medical question answering dataset

---

<div align="center">

**Built with ❤️ for the medical AI community**

[⭐ Star on GitHub](https://github.com/zeeza18/MEDICAL-RAG) • [🐛 Report Bug](https://github.com/zeeza18/MEDICAL-RAG/issues) • [💡 Request Feature](https://github.com/zeeza18/MEDICAL-RAG/issues)

</div>
