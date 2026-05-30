#import <React/RCTBridgeModule.h>

// Objective-C bridge exposing the Swift EmbeddingModule to React Native.
@interface RCT_EXTERN_MODULE(EmbeddingModule, NSObject)

RCT_EXTERN_METHOD(generateEmbedding:(NSString *)frameBase64
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
