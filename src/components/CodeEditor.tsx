import Editor, { Monaco } from '@monaco-editor/react';

interface CodeEditorProps {
  onChange?: (value: string | undefined) => void;
  defaultValue?: string;
}

export default function CodeEditor({ onChange, defaultValue }: CodeEditorProps) {
  
  const handleEditorWillMount = (monaco: Monaco) => {
    // 1. Register Language
    monaco.languages.register({ id: 'mlscript' });

    // 2. Define Monarch Syntax Highlighting
    monaco.languages.setMonarchTokensProvider('mlscript', {
      ignoreCase: true,
      
      // Extracted directly from MLScript.g4
      keywords: [
        'LOAD', 'SHOW', 'SET', 'TARGET', 'SPLIT', 'DROP', 'COLUMN', 'NA', 
        'NORMALIZE', 'STANDARDIZE', 'CREATE', 'MODEL', 'CHOOSE', 'TRAIN', 
        'PREDICT', 'EVALUATE', 'EXPORT', 'IMPORT', 'INTO', 'AS', 'BY', 
        'FROM', 'WITH', 'WITHOUT', 'KEEP', 'ON', 'OF', 'TO', 'FOR', 'IN',
        'WHERE', 'AND', 'OR', 'NOT', 'TRUE', 'FALSE', 'CSV', 'SQL', 'JSON', 
        'PKL', 'JOBLIB', 'ROWS', 'ROW', 'FEATURE', 'FEATURES', 'COUNT',
        'SAFE', 'MODE', 'METHOD', 'RANGE', 'HANDLE'
      ],
      
      builtins: [
        // Models
        'LINEAR_REGRESSION', 'RIDGE', 'KNN_REGRESSION', 'SVC',
        // Metrics
        'MSE', 'RMSE', 'MAE', 'ACCURACY', 'R2', 'PRECISION', 'RECALL', 'F1_SCORE', 'ROC_AUC',
        // Aggregations
        'MEAN', 'MAX', 'MIN', 'SUM', 'MEDIAN', 'PROD', 'STD', 'VAR', 'UNIQUE_VALS', 'UNIQUE_COUNT',
        // Preprocess Methods
        'MINMAX', 'ROBUST', 'ZERO_ONE', 'MINUS_ONE_ONE', 'DROP_NA', 'FILL_MEAN', 'FILL_MEDIAN'
      ],

      params: [
        'FIT_INTERCEPT', 'MAX_ITERATIONS', 'N_JOBS', 'POSITIVE', 'TOL', 
        'ALPHA', 'SOLVER', 'N_NEIGHBORS', 'WEIGHTS', 'ALGORITHM', 
        'C', 'COEF_0', 'DEGREE', 'GAMMA', 'KERNEL', 'PROBABILITY'
      ],

      operators: [
        '=', '!=', '>', '<', '>=', '<=', ':', ','
      ],

      tokenizer: {
        root: [
          // Identifiers, Keywords, and Builtins
          [/[a-zA-Z_]\w*/, { 
            cases: { 
              '@keywords': 'keyword', 
              '@builtins': 'builtin',
              '@params': 'variable.parameter',
              '@default': 'identifier' 
            } 
          }],

          // Comments (MLScript uses #)
          [/#.*/, 'comment'],

          // Column Names (Double Quotes)
          [/"([^"\\]|\\.)*"/, 'string.column'],

          // Strings (Single Quotes)
          [/'([^'\\]|\\.)*'/, 'string'],

          // Numbers (Floats, E-notation, Integers)
          [/-?\d+\.\d+(E-?\d+)?/, 'number.float'],
          [/-?\d+/, 'number'],

          // Punctuation and Operators
          [/[=><!:,;()]+/, 'operator']
        ]
      }
    });

    // 3. Register Autocomplete & Snippets
    monaco.languages.registerCompletionItemProvider('mlscript', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions = [
          // --- Core Snippets ---
          {
            label: 'LOAD CSV',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "LOAD '${1:path/to/data.csv}' AS CSV INTO ${2:dataset_name};",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Load a CSV file into a dataset variable',
            range
          },
          {
            label: 'SHOW ROWS',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "SHOW ROWS ${1:1} TO ${2:10} FROM ${3:dataset_name};",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Display a range of rows from a dataset',
            range
          },
          {
            label: 'CREATE MODEL',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "CREATE MODEL ${1:my_model} CHOOSE ${2|LINEAR_REGRESSION,RIDGE,KNN_REGRESSION,SVC|};\n",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Initialize a new machine learning model',
            range
          },
          {
            label: 'TRAIN MODEL',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "TRAIN ${1:my_model} ON ${2:train_dataset};\n",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Train a model on a dataset',
            range
          },
          {
            label: 'PREDICT',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "PREDICT ${1:my_model} ON ${2:test_dataset} INTO ${3:predictions};\n",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Run predictions using a trained model',
            range
          },
          {
            label: 'EVALUATE',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "EVALUATE ${1:my_model} ON ${2:test_dataset} USING ${3|MSE,MAE,RMSE,ACCURACY,F1_SCORE|};\n",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Evaluate a model using a specific metric',
            range
          },
          {
            label: 'SPLIT DATASET',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "SPLIT ${1:dataset} RATIO ${2:80}:${3:20} INTO ${4:train_set}, ${5:test_set} WITH SEED ${6:42}, SHUFFLE TRUE;\n",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Split a dataset into training and testing sets',
            range
          },
          {
            label: 'SET TARGET',
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: "SET TARGET \"${1:target_column}\" FOR ${2:dataset_name};\n",
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: 'Define the target feature for prediction',
            range
          }
        ];

        // Combine snippets with basic keyword suggestions
        const keywords = [
          'LOAD', 'SHOW', 'PREPROCESS', 'NORMALIZE', 'STANDARDIZE', 'DROP',
          'CREATE MODEL', 'TRAIN', 'PREDICT', 'EVALUATE', 'EXPORT MODEL', 'IMPORT MODEL'
        ];

        keywords.forEach(kw => {
          suggestions.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            documentation: `MLScript Keyword: ${kw}`,
            range
          } as any);
        });

        return { suggestions };
      }
    });

    // 4. Define Rich Custom Theme
    monaco.editor.defineTheme('mlscript-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'c586c0', fontStyle: 'bold' },          // Pink/Purple
        { token: 'builtin', foreground: '4ec9b0' },                             // Emerald green for Models/Metrics
        { token: 'variable.parameter', foreground: '9cdcfe', fontStyle: 'italic'}, // Light blue for Hyperparameters
        { token: 'identifier', foreground: 'd4d4d4' },                          // Standard text
        { token: 'string', foreground: 'ce9178' },                              // Orange for 'strings'
        { token: 'string.column', foreground: 'dcdcaa' },                       // Yellow for "column_names"
        { token: 'number', foreground: 'b5cea8' },                              // Light green for numbers
        { token: 'number.float', foreground: 'b5cea8' },
        { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },        // Faded green for # comments
        { token: 'operator', foreground: 'd4d4d4' }
      ],
      colors: {
        'editor.background': '#171717',
        'editor.lineHighlightBackground': '#262626',
        'editorSuggestWidget.background': '#1f1f1f',
        'editorSuggestWidget.border': '#333333',
        'editorSuggestWidget.selectedBackground': '#062f4a'
      }
    });
  };

  return (
    <Editor
      height="100%"
      defaultLanguage="mlscript"
      theme="mlscript-dark"
      defaultValue={defaultValue}
      beforeMount={handleEditorWillMount}
      onChange={onChange}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
        wordWrap: 'on',
        padding: { top: 16 },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        // UI Enhancements for Autocomplete
        suggestOnTriggerCharacters: true,
        quickSuggestions: { other: true, comments: false, strings: false },
        acceptSuggestionOnEnter: "smart",
        tabCompletion: "on"
      }}
    />
  );
}