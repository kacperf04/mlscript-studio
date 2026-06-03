use std::fs;
use std::process::Command;
use std::path::Path;

// THE ENGINE DIRECTORY: Where your C++ build and Python packages live.
const ENGINE_DIR: &str = "/home/kacperfilip/personal_projects/MLScript/NeuroScript";

#[tauri::command]
fn read_dataset_file(file_path: String, workspace_path: String) -> Result<String, String> {
    let path = Path::new(&file_path);
    let final_path = if path.is_absolute() {
        path.to_path_buf()
    } else {
        Path::new(&workspace_path).join(path)
    };
    fs::read_to_string(&final_path)
        .map_err(|e| format!("Failed to read file at '{}': {}", final_path.display(), e))
}

#[tauri::command]
fn run_mlscript(code: String, workspace_path: String) -> Result<String, String> {
    if !Path::new(ENGINE_DIR).exists() {
        return Err(format!("FATAL: The MLScript engine directory does not exist at:\n{}", ENGINE_DIR));
    }

    let temp_mls_path = format!("{}/temp_run.mls", workspace_path);
    fs::write(&temp_mls_path, &code).map_err(|e| format!("Failed to write temp file: {}", e))?;

    let transpiler_path = format!("{}/build/mlscript", ENGINE_DIR);
    if !Path::new(&transpiler_path).exists() {
        return Err(format!("FATAL: Transpiler not found at:\n{}", transpiler_path));
    }

    let transpile_process = Command::new(&transpiler_path)
        .arg(&temp_mls_path)
        .current_dir(&workspace_path)
        .output();

    let transpile_output = match transpile_process {
        Ok(output) => output,
        Err(e) => return Err(format!("System failed to execute C++ binary: {}", e))
    };

    if !transpile_output.status.success() {
        let err = String::from_utf8_lossy(&transpile_output.stderr);
        return Err(format!("Transpilation Error:\n{}", err));
    }

    // ================================================================
    // TAURI AUTO-INJECTOR: 
    // Reads the Python file C++ just generated and appends our analyzer
    // ================================================================
    let py_script_path = format!("{}/mlscript.out.py", workspace_path);
    let mut py_code = fs::read_to_string(&py_script_path).unwrap_or_default();
    
    let extractor_script = r#"
# --- TAURI AUTO-INJECTED MODEL EXTRACTOR ---
import sys, json
try:
    import numpy as np
    from sklearn.base import BaseEstimator
    
    # Safely truncate massive arrays (like weights/coef matrices) for the UI
    def safe_serialize(obj):
        if isinstance(obj, np.ndarray):
            lst = obj.tolist()
            if isinstance(lst, list) and len(lst) > 5: return f"Array({str(lst[:3])[:-1]} ... len={len(lst)})"
            return lst
        if isinstance(obj, np.integer): return int(obj)
        if isinstance(obj, np.floating): return float(obj)
        if isinstance(obj, list) and len(obj) > 5: return f"List({str(obj[:3])[:-1]} ... len={len(obj)})"
        return str(obj)

    dumped_models = []
    # Scan the live Python memory environment for any ML Models
    for name, obj in list(globals().items()):
        if isinstance(obj, BaseEstimator):
            params = obj.get_params() if hasattr(obj, 'get_params') else {}
            learned = {}
            # In Scikit-Learn, all fitted statistics end with an underscore (e.g., coef_)
            for k in dir(obj):
                if k.endswith('_') and not k.startswith('_') and not callable(getattr(obj, k)):
                    try: learned[k] = getattr(obj, k)
                    except: pass
                    
            dumped_models.append({
                'name': name,
                'type': type(obj).__name__,
                'is_fitted': len(learned) > 0,
                'params': params,
                'learned_attrs': learned
            })
            
    print("\n__TAURI_MODELS_START__")
    print(json.dumps(dumped_models, default=safe_serialize))
except Exception as e:
    pass
"#;
    py_code.push_str(extractor_script);
    fs::write(&py_script_path, py_code).map_err(|e| format!("Failed to inject python analyzer: {}", e))?;
    // ================================================================

    let python_process = Command::new("python3")
        .arg("mlscript.out.py")
        .current_dir(&workspace_path)
        .env("PYTHONPATH", ENGINE_DIR) 
        .output();

    let python_output = match python_process {
        Ok(output) => output,
        Err(e) => return Err(format!("System failed to execute Python: {}", e))
    };

    let stdout = String::from_utf8_lossy(&python_output.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&python_output.stderr).into_owned();

    if !python_output.status.success() {
        return Err(format!("Python Runtime Error:\n{}\n{}", stdout, stderr));
    }

    Ok(stdout)
}

#[tauri::command]
fn read_code_file(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
fn save_code_file(file_path: String, code: String) -> Result<(), String> {
    fs::write(&file_path, code).map_err(|e| format!("Failed to save file: {}", e))
}

#[tauri::command]
fn list_workspace_files(workspace_path: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    
    fn visit_dirs(dir: &Path, files: &mut Vec<String>) -> std::io::Result<()> {
        if dir.is_dir() {
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    let dir_name = path.file_name().unwrap_or_default().to_string_lossy();
                    // model_out is intentionally ignored here so scripts don't get cluttered
                    if dir_name != "build" && dir_name != ".git" && dir_name != "vscode-extension" && dir_name != "model_out" {
                        visit_dirs(&path, files)?;
                    }
                } else if path.extension().and_then(|s| s.to_str()) == Some("mls") {
                    files.push(path.to_string_lossy().to_string());
                }
            }
        }
        Ok(())
    }

    visit_dirs(Path::new(&workspace_path), &mut files).map_err(|e| e.to_string())?;
    files.sort();
    Ok(files)
}

#[tauri::command]
fn list_workspace_models(workspace_path: String) -> Result<Vec<String>, String> {
    let mut files = Vec::new();
    
    fn visit_dirs(dir: &Path, files: &mut Vec<String>) -> std::io::Result<()> {
        if dir.is_dir() {
            for entry in fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    let dir_name = path.file_name().unwrap_or_default().to_string_lossy();
                    // THE FIX: model_out is NO LONGER ignored here!
                    if dir_name != "build" && dir_name != ".git" && dir_name != "vscode-extension" {
                        visit_dirs(&path, files)?;
                    }
                } else if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    if ext == "joblib" || ext == "pkl" {
                        files.push(path.to_string_lossy().to_string());
                    }
                }
            }
        }
        Ok(())
    }

    visit_dirs(Path::new(&workspace_path), &mut files).map_err(|e| e.to_string())?;
    files.sort();
    Ok(files)
}

#[tauri::command]
fn inspect_model(workspace_path: String, model_path: String) -> Result<String, String> {
    // This inline Python script loads the binary and extracts metadata + learned stats safely
    let py_script = format!(
        r#"import json, sys, pickle
try:
    import joblib
    import numpy as np
    path = r'{}'
    model = pickle.load(open(path, 'rb')) if path.endswith('.pkl') else joblib.load(path)
    params = model.get_params() if hasattr(model, 'get_params') else {{}}
    
    def safe_serialize(obj):
        if isinstance(obj, np.ndarray):
            lst = obj.tolist()
            if isinstance(lst, list) and len(lst) > 5: return f"Array({{str(lst[:3])[:-1]}} ... len={{len(lst)}})"
            return lst
        if isinstance(obj, np.integer): return int(obj)
        if isinstance(obj, np.floating): return float(obj)
        if isinstance(obj, list) and len(obj) > 5: return f"List({{str(obj[:3])[:-1]}} ... len={{len(obj)}})"
        return str(obj)

    learned = {{}}
    for k in dir(model):
        if k.endswith('_') and not k.startswith('_') and not callable(getattr(model, k)):
            try: learned[k] = getattr(model, k)
            except: pass
            
    is_fitted = len(learned) > 0
    print(json.dumps({{'type': type(model).__name__, 'params': params, 'is_fitted': is_fitted, 'learned_attrs': learned}}, default=safe_serialize))
except Exception as e:
    print(json.dumps({{'error': str(e)}}))"#,
        model_path
    );

    let python_process = Command::new("python3")
        .arg("-c")
        .arg(&py_script)
        .current_dir(&workspace_path)
        .env("PYTHONPATH", ENGINE_DIR) 
        .output()
        .map_err(|e| format!("System failed to execute Python: {}", e))?;

    let stdout = String::from_utf8_lossy(&python_process.stdout).into_owned();
    Ok(stdout)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_dataset_file, 
            run_mlscript,
            read_code_file,
            save_code_file,
            list_workspace_files,
            list_workspace_models,
            inspect_model
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}