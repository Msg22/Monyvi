//! NONPRODUCTION research adapter: AAC-LC/M4A -> 16 kHz mono f32 via Symphonia.
//! Its compilation, Edge behavior, duration accuracy and speech-preservation
//! characteristics have NOT been verified. Never import into parse-voice as-is.

use std::io::Cursor;

use js_sys::{Float32Array, Object, Reflect};
use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use wasm_bindgen::prelude::*;

const TARGET_RATE_HZ: u32 = 16_000;
const MAX_COMPRESSED_BYTES: usize = 5 * 1024 * 1024;
const MAX_DECODED_SECONDS_SAFETY: usize = 65;

fn invalid(message: &str) -> JsValue {
    JsValue::from_str(message)
}

fn put_number(object: &Object, key: &str, value: f64) -> Result<(), JsValue> {
    Reflect::set(object, &JsValue::from_str(key), &JsValue::from_f64(value))
        .map(|_| ())
}

#[wasm_bindgen]
pub fn decode_m4a_to_pcm16k(bytes: &[u8]) -> Result<JsValue, JsValue> {
    if bytes.is_empty() || bytes.len() > MAX_COMPRESSED_BYTES {
        return Err(invalid("Empty or oversized encoded audio"));
    }
    // This is an M4A/AAC-LC-only adapter, NOT a generic WebM/MP3 fallback.
    if bytes.len() < 12 || &bytes[4..8] != b"ftyp" {
        return Err(invalid("Not an ISO BMFF ftyp container"));
    }
    let media = MediaSourceStream::new(
        Box::new(Cursor::new(bytes.to_vec())),
        Default::default(),
    );
    let mut hint = Hint::new();
    hint.with_extension("m4a");
    let mut format = symphonia::default::get_probe()
        .probe(&hint, media, FormatOptions::default(), MetadataOptions::default())
        .map_err(|_| invalid("Unparseable container"))?;
    let track = format
        .default_track(TrackType::Audio)
        .ok_or_else(|| invalid("No audio track"))?;
    let audio_params = track
        .codec_params
        .as_ref()
        .and_then(|params| params.audio())
        .ok_or_else(|| invalid("Missing audio codec parameters"))?;
    let source_rate = audio_params
        .sample_rate
        .ok_or_else(|| invalid("Missing source sample rate"))?;
    if !(8_000..=96_000).contains(&source_rate) {
        return Err(invalid("Unsupported source sample rate"));
    }
    let track_id = track.id;
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(audio_params, &AudioDecoderOptions::default())
        .map_err(|_| invalid("Unsupported audio codec (AAC-LC required)"))?;
    let max_frames = source_rate as usize * MAX_DECODED_SECONDS_SAFETY;
    let mut mono: Vec<f32> = Vec::new();

    while let Some(packet) = format
        .next_packet()
        .map_err(|_| invalid("Truncated or invalid media packet"))?
    {
        if packet.track_id != track_id {
            continue;
        }
        let decoded = decoder
            .decode(&packet)
            .map_err(|_| invalid("Failed to decode AAC packet"))?;
        // v0.6.1 GenericAudioBufferRef has spec(), frames(), and
        // copy_to_slice_interleaved(); these are the documented APIs.
        if decoded.spec().rate() != source_rate {
            return Err(invalid("Decoded sample rate differs from track parameters"));
        }
        let channels = decoded.spec().channels().count();
        if channels == 0 || channels > 2 {
            return Err(invalid("Unsupported channel count"));
        }
        if decoded.frames() > max_frames.saturating_sub(mono.len()) {
            return Err(invalid("Decoded audio exceeded nonproduction safety cap"));
        }
        let mut interleaved = vec![0.0_f32; decoded.samples_interleaved()];
        decoded.copy_to_slice_interleaved(&mut interleaved);
        if interleaved.len() % channels != 0 {
            return Err(invalid("Invalid interleaved frame count"));
        }
        for frame in interleaved.chunks_exact(channels) {
            let mean = frame.iter().copied().sum::<f32>() / channels as f32;
            if !mean.is_finite() {
                return Err(invalid("Non-finite decoded audio"));
            }
            mono.push(mean.clamp(-1.0, 1.0));
        }
    }

    if mono.is_empty() {
        return Err(invalid("No decoded audio samples"));
    }
    let decoded_source_frames = mono.len();
    // LINEAR resampling is a provisional benchmark dependency, not a
    // production-quality resampling approval. Compare with a reference
    // resampler on quiet Arabic/English before treating VAD scores as valid.
    let output_len = ((mono.len() as f64 * TARGET_RATE_HZ as f64
        / source_rate as f64).round() as usize).max(1);
    let mut pcm = Vec::with_capacity(output_len);
    for i in 0..output_len {
        let position = i as f64 * source_rate as f64 / TARGET_RATE_HZ as f64;
        let first = (position.floor() as usize).min(mono.len() - 1);
        let second = (first + 1).min(mono.len() - 1);
        let fraction = (position - first as f64) as f32;
        pcm.push(mono[first] * (1.0 - fraction) + mono[second] * fraction);
    }

    let result = Object::new();
    Reflect::set(
        &result,
        &JsValue::from_str("samples"),
        &Float32Array::from(pcm.as_slice()),
    )?;
    put_number(&result, "sourceRateHz", source_rate as f64)?;
    put_number(&result, "decodedSourceFrames", decoded_source_frames as f64)?;
    put_number(&result, "outputRateHz", TARGET_RATE_HZ as f64)?;
    Ok(result.into())
}
