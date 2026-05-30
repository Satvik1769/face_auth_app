package com.datalake.faceauth

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * Registers all FaceAuth native modules. Add to your MainApplication's
 * getPackages() list:  packages.add(FaceAuthPackage())
 */
class FaceAuthPackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> = listOf(
        FaceDetectorModule(ctx),
        LivenessModule(ctx),
        EmbeddingModule(ctx),
        SecureStorageModule(ctx),
    )

    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
